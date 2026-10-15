//! A bundle read in pieces: where each entry is in the file, and an entry
//! decoded from its own bytes alone.
//!
//! A bundle behind a URL is not downloaded to be installed. Its directory is
//! at the end of the file and says where every entry is; the head and the
//! manifest are the first two entries; a blob is fetched only when the
//! install finds it missing. This is the zip half of that — byte slices in,
//! entries out — and the requests are the runtime's.
//!
//! An entry is taken to run from its local header to the next entry's, or to
//! the directory: a zip is its entries end to end, so that range holds the
//! header, the data and whatever trails it, without trusting the local
//! header's own lengths to find where the next begins.

use std::collections::BTreeMap;
use std::io::{self, Write};
use std::ops::Range;

use flate2::write::DeflateDecoder;
use flate2::Crc;
use opys_core::Manifest;

use crate::{
    blob_entry, not_a_bundle, parse_head, parse_manifest, BundleError, HEAD_ENTRY, LOCAL_HEADER,
    LOCAL_HEADER_LEN, MANIFEST_ENTRY,
};

const END: [u8; 4] = *b"PK\x05\x06";
const END_LEN: usize = 22;
const END64_LOCATOR: [u8; 4] = *b"PK\x06\x07";
const END64_LOCATOR_LEN: usize = 20;
const END64: [u8; 4] = *b"PK\x06\x06";
const END64_LEN: usize = 56;
const CENTRAL: [u8; 4] = *b"PK\x01\x02";
const CENTRAL_LEN: usize = 46;
/// The longest a zip's comment can be, and so how far from the end its
/// end-of-directory record can sit.
const LONGEST_COMMENT: usize = u16::MAX as usize;
const ZIP64_EXTRA: u16 = 0x0001;
const ENCRYPTED: u16 = 1;

const STORED: u16 = 0;
const DEFLATED: u16 = 8;

/// One entry: where its bytes are in the file, and what they decode to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    range: Range<u64>,
    method: u16,
    compressed: u64,
    size: u64,
    crc: u32,
}

impl Entry {
    /// The bytes of the file that hold the entry, header to trailer.
    pub fn range(&self) -> Range<u64> {
        self.range.clone()
    }

    /// What the entry decodes to, in bytes.
    pub fn size(&self) -> u64 {
        self.size
    }

    /// A writer that takes the bytes of [`Entry::range`], in order and in
    /// pieces of any size, and writes what they decode to into `out`.
    pub fn decoder<W: Write>(&self, out: W) -> EntryDecoder<W> {
        EntryDecoder {
            entry: self.clone(),
            state: State::Header(Vec::new()),
            out: Some(out),
        }
    }

    /// The entry decoded from `raw`, the bytes of its range.
    fn decode(&self, raw: &[u8]) -> Result<Vec<u8>, BundleError> {
        let mut decoder = self.decoder(Vec::with_capacity(self.size as usize));
        decoder.write_all(raw)?;
        decoder.finish()
    }
}

/// Where every entry of a bundle is, read off the end of the file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Directory {
    len: u64,
    entries: BTreeMap<String, Entry>,
}

/// What the last bytes of a bundle give of its directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Back {
    Directory(Directory),
    /// The directory begins before what was given: it takes this many bytes,
    /// counted from the end of the file — always more than were given.
    Needs(u64),
}

fn short(bytes: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([bytes[at], bytes[at + 1]])
}

fn long(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

fn wide(bytes: &[u8], at: usize) -> u64 {
    let mut word = [0; 8];
    word.copy_from_slice(&bytes[at..at + 8]);
    u64::from_le_bytes(word)
}

/// The end-of-directory record's place in `tail`. It is the last thing in
/// the file but a comment, so it is looked for from the back, and a match is
/// only one whose comment runs exactly to the end.
fn end_record(tail: &[u8]) -> Option<usize> {
    let last = tail.len().checked_sub(END_LEN)?;
    (0..=last).rev().find(|&at| {
        tail[at..at + 4] == END && usize::from(short(tail, at + 20)) == tail.len() - at - END_LEN
    })
}

/// Read the directory of a bundle `file_len` bytes long from `tail`, its
/// last bytes. Asks for more, by [`Back::Needs`], until the tail holds it.
pub fn directory_from_back(tail: &[u8], file_len: u64) -> Result<Back, BundleError> {
    let given = tail.len() as u64;
    if given > file_len {
        return Err(not_a_bundle("it is shorter than its own tail"));
    }
    // Where an offset counted from the start of the file is in the tail.
    let at = |offset: u64| offset.checked_sub(file_len - given).map(|at| at as usize);
    let short_of = |offset: u64| Ok(Back::Needs(file_len - offset));

    let Some(end) = end_record(tail) else {
        let reach = file_len.min((END_LEN + LONGEST_COMMENT) as u64);
        return if given < reach {
            Ok(Back::Needs(reach))
        } else {
            Err(not_a_bundle("it has no zip directory"))
        };
    };
    let (mut count, mut size, mut offset) = (
        u64::from(short(tail, end + 10)),
        u64::from(long(tail, end + 12)),
        u64::from(long(tail, end + 16)),
    );
    // A zip too large for the classic record says so with all ones and keeps
    // the real numbers in a zip64 record, found through a locator right
    // before the classic one.
    if count == u64::from(u16::MAX) || size == u64::from(u32::MAX) || offset == u64::from(u32::MAX)
    {
        let locator = end
            .checked_sub(END64_LOCATOR_LEN)
            .filter(|&locator| tail[locator..locator + 4] == END64_LOCATOR)
            .ok_or_else(|| not_a_bundle("its zip64 directory has no locator"))?;
        let record = wide(tail, locator + 8);
        let Some(record) = at(record) else {
            return short_of(record);
        };
        if tail
            .get(record..record + END64_LEN)
            .map_or(true, |r| r[..4] != END64)
        {
            return Err(not_a_bundle(
                "its zip64 directory is not where its locator says",
            ));
        }
        (count, size, offset) = (
            wide(tail, record + 32),
            wide(tail, record + 40),
            wide(tail, record + 48),
        );
    }
    let Some(start) = at(offset) else {
        return short_of(offset);
    };
    let central = usize::try_from(size)
        .ok()
        .and_then(|size| tail.get(start..start.checked_add(size)?))
        .ok_or_else(|| not_a_bundle("its directory runs past its end"))?;

    let mut found: Vec<(String, Entry)> = Vec::new();
    let mut at_entry = 0;
    while at_entry < central.len() {
        let fixed = central
            .get(at_entry..at_entry + CENTRAL_LEN)
            .filter(|fixed| fixed[..4] == CENTRAL)
            .ok_or_else(|| not_a_bundle("its directory holds something that is not an entry"))?;
        if short(fixed, 8) & ENCRYPTED != 0 {
            return Err(not_a_bundle("it has an encrypted entry"));
        }
        let (name_len, extra_len, comment_len) = (
            usize::from(short(fixed, 28)),
            usize::from(short(fixed, 30)),
            usize::from(short(fixed, 32)),
        );
        let name_at = at_entry + CENTRAL_LEN;
        let extra_at = name_at + name_len;
        let next = extra_at + extra_len + comment_len;
        let (name, extra) = central
            .get(name_at..extra_at)
            .zip(central.get(extra_at..extra_at + extra_len))
            .filter(|_| next <= central.len())
            .ok_or_else(|| not_a_bundle("an entry of its directory runs past it"))?;
        let name = std::str::from_utf8(name)
            .map_err(|_| not_a_bundle("an entry's name is not UTF-8"))?
            .to_owned();

        let mut size = u64::from(long(fixed, 24));
        let mut compressed = u64::from(long(fixed, 20));
        let mut local = u64::from(long(fixed, 42));
        let mut wide_values = zip64_values(extra)?.into_iter();
        for value in [&mut size, &mut compressed, &mut local] {
            if *value == u64::from(u32::MAX) {
                *value = wide_values
                    .next()
                    .ok_or_else(|| not_a_bundle("an entry lacks its zip64 sizes"))?;
            }
        }
        found.push((
            name,
            Entry {
                range: local..local,
                method: short(fixed, 10),
                compressed,
                size,
                crc: long(fixed, 16),
            },
        ));
        at_entry = next;
    }
    if found.len() as u64 != count {
        return Err(not_a_bundle(
            "its directory does not hold the entries it counts",
        ));
    }

    // Each entry runs to where the next one starts, the last to the
    // directory.
    found.sort_by_key(|(_, entry)| entry.range.start);
    let ends: Vec<u64> = found
        .iter()
        .skip(1)
        .map(|(_, entry)| entry.range.start)
        .chain([offset])
        .collect();
    let mut entries = BTreeMap::new();
    for ((name, mut entry), end) in found.into_iter().zip(ends) {
        if end < entry.range.start + LOCAL_HEADER_LEN as u64 + entry.compressed {
            return Err(not_a_bundle("its entries overlap"));
        }
        entry.range.end = end;
        if entries.insert(name, entry).is_some() {
            return Err(not_a_bundle("it names one entry twice"));
        }
    }
    Ok(Back::Directory(Directory {
        len: file_len,
        entries,
    }))
}

/// The zip64 sizes and offset an entry's extra field holds, in the order
/// they stand in for the classic ones.
fn zip64_values(mut extra: &[u8]) -> Result<Vec<u64>, BundleError> {
    while extra.len() >= 4 {
        let (id, len) = (short(extra, 0), usize::from(short(extra, 2)));
        let body = extra
            .get(4..4 + len)
            .ok_or_else(|| not_a_bundle("an entry's extra field runs past it"))?;
        if id == ZIP64_EXTRA {
            return Ok(body.chunks_exact(8).map(|word| wide(word, 0)).collect());
        }
        extra = &extra[4 + len..];
    }
    Ok(Vec::new())
}

impl Directory {
    /// How long the bundle is.
    pub fn file_len(&self) -> u64 {
        self.len
    }

    /// The bytes that hold the head and the manifest: the two entries an
    /// install reads before it knows which blobs it wants.
    pub fn front(&self) -> Result<Range<u64>, BundleError> {
        let head = self.entry(HEAD_ENTRY)?;
        let manifest = self.entry(MANIFEST_ENTRY)?;
        Ok(head.range.start.min(manifest.range.start)..head.range.end.max(manifest.range.end))
    }

    /// The manifest, from `front`, the bytes of [`Directory::front`]. Makes
    /// the promises [`crate::open_bundle`] makes: the head is in this
    /// reader's format, read before the manifest is, and every blob the
    /// manifest names is in the bundle.
    pub fn open(&self, front: &[u8]) -> Result<Manifest, BundleError> {
        let base = self.front()?.start;
        let entry_bytes = |name: &'static str| {
            let entry = self.entry(name)?;
            let raw = front
                .get((entry.range.start - base) as usize..(entry.range.end - base) as usize)
                .ok_or_else(|| not_a_bundle("its front is shorter than its directory says"))?;
            entry.decode(raw)
        };
        parse_head(&entry_bytes(HEAD_ENTRY)?)?;
        let manifest = parse_manifest(&entry_bytes(MANIFEST_ENTRY)?)?;
        for id in manifest.blob_ids() {
            self.blob(id)?;
        }
        Ok(manifest)
    }

    /// Where the blob `id` is.
    pub fn blob(&self, id: &str) -> Result<&Entry, BundleError> {
        self.entries
            .get(&blob_entry(id))
            .ok_or_else(|| BundleError::MissingBlob(id.to_owned()))
    }

    fn entry(&self, name: &'static str) -> Result<&Entry, BundleError> {
        self.entries
            .get(name)
            .ok_or(BundleError::MissingEntry(name))
    }
}

/// Where an [`EntryDecoder`] is in the bytes it is given.
enum State<W: Write> {
    /// The local header, gathered until its names and extras are in.
    Header(Vec<u8>),
    /// The data, this much of it still to come.
    Data { left: u64, sink: Sink<W> },
    /// Past the data: a trailer, or nothing.
    Done(Checked<W>),
}

enum Sink<W: Write> {
    Stored(Checked<W>),
    Deflated(DeflateDecoder<Checked<W>>),
}

/// Counts and checksums what is written through it.
struct Checked<W> {
    inner: W,
    crc: Crc,
}

impl<W: Write> Write for Checked<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let written = self.inner.write(buf)?;
        self.crc.update(&buf[..written]);
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

/// Decodes an entry from the bytes of its range, as they arrive.
pub struct EntryDecoder<W: Write> {
    entry: Entry,
    state: State<W>,
    out: Option<W>,
}

fn invalid(why: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, why)
}

impl<W: Write> EntryDecoder<W> {
    /// Once the local header is whole: where the data starts in it, and the
    /// state that reads the data the way the directory says.
    fn begin(&mut self, header: &[u8]) -> io::Result<Option<(usize, State<W>)>> {
        if header.len() < LOCAL_HEADER_LEN {
            return Ok(None);
        }
        if header[..4] != LOCAL_HEADER {
            return Err(invalid("an entry does not begin with its local header"));
        }
        let start =
            LOCAL_HEADER_LEN + usize::from(short(header, 26)) + usize::from(short(header, 28));
        if header.len() < start {
            return Ok(None);
        }
        let out = Checked {
            inner: self.out.take().expect("the sink is made once"),
            crc: Crc::new(),
        };
        let sink = match self.entry.method {
            STORED => Sink::Stored(out),
            DEFLATED => Sink::Deflated(DeflateDecoder::new(out)),
            _ => return Err(invalid("an entry is compressed in a way a bundle is not")),
        };
        let data = State::Data {
            left: self.entry.compressed,
            sink,
        };
        Ok(Some((start, data)))
    }

    /// Where the decoded bytes go, to take what has been written so far.
    pub fn get_mut(&mut self) -> &mut W {
        match &mut self.state {
            State::Header(_) => self.out.as_mut().expect("the sink is made once"),
            State::Data {
                sink: Sink::Stored(out),
                ..
            }
            | State::Done(out) => &mut out.inner,
            State::Data {
                sink: Sink::Deflated(out),
                ..
            } => &mut out.get_mut().inner,
        }
    }

    /// Check what was written and hand back where it went.
    pub fn finish(self) -> Result<W, BundleError> {
        let checked = match self.state {
            State::Done(checked) => checked,
            State::Data { left: 0, sink } => finish_sink(sink)?,
            _ => return Err(not_a_bundle("an entry ends before its data does")),
        };
        if checked.crc.amount() as u64 != self.entry.size & u64::from(u32::MAX)
            || checked.crc.sum() != self.entry.crc
        {
            return Err(not_a_bundle(
                "an entry does not decode to what its directory says",
            ));
        }
        Ok(checked.inner)
    }
}

fn finish_sink<W: Write>(sink: Sink<W>) -> io::Result<Checked<W>> {
    match sink {
        Sink::Stored(checked) => Ok(checked),
        Sink::Deflated(decoder) => decoder.finish(),
    }
}

impl<W: Write> Write for EntryDecoder<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut rest = buf;
        while !rest.is_empty() {
            self.state = match std::mem::replace(&mut self.state, State::Header(Vec::new())) {
                State::Header(mut header) => {
                    let before = header.len();
                    header.extend_from_slice(rest);
                    match self.begin(&header)? {
                        // What came in past the header is data.
                        Some((start, data)) => {
                            rest = &rest[start - before..];
                            data
                        }
                        None => {
                            rest = &[];
                            State::Header(header)
                        }
                    }
                }
                State::Data { left, mut sink } => {
                    let take = rest.len().min(usize::try_from(left).unwrap_or(usize::MAX));
                    match &mut sink {
                        Sink::Stored(out) => out.write_all(&rest[..take])?,
                        Sink::Deflated(out) => out.write_all(&rest[..take])?,
                    }
                    rest = &rest[take..];
                    match left - take as u64 {
                        0 => State::Done(finish_sink(sink)?),
                        left => State::Data { left, sink },
                    }
                }
                // A data descriptor, which the directory already had.
                done @ State::Done(_) => {
                    rest = &[];
                    done
                }
            };
        }
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        match &mut self.state {
            State::Data {
                sink: Sink::Stored(out),
                ..
            }
            | State::Done(out) => out.flush(),
            State::Data {
                sink: Sink::Deflated(out),
                ..
            } => out.flush(),
            State::Header(_) => Ok(()),
        }
    }
}
