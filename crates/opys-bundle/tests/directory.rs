//! A bundle read in pieces: its directory off the end, an entry off its own
//! bytes.

use std::io::{Cursor, Write};

use opys_bundle::{
    blob_id, directory_from_back, write_bundle, Back, BlobSource, Blobs, BundleError, Directory,
    Head, BUNDLE_FORMAT,
};
use opys_core::Manifest;
use serde_json::json;

/// Bytes deflate cannot shrink, so a blob's size is what it costs.
fn noise(len: usize, seed: u32) -> Vec<u8> {
    let mut state = seed.wrapping_mul(0x9E37_79B9) | 1;
    (0..len)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            state as u8
        })
        .collect()
}

struct Sample {
    bytes: Vec<u8>,
    manifest: Manifest,
    blobs: Vec<(String, Vec<u8>)>,
}

fn sample() -> Sample {
    let contents = vec![
        b"hello".to_vec(),
        noise(200_000, 7),
        b"a".repeat(100_000),
        Vec::new(),
    ];
    let blobs: Vec<(String, Vec<u8>)> = contents
        .into_iter()
        .map(|content| (blob_id(&content), content))
        .collect();
    let artifacts: Vec<_> = blobs
        .iter()
        .enumerate()
        .map(|(n, (id, _))| json!({ "path": format!("${{root}}/{n}"), "source": { "blob": id } }))
        .collect();
    let manifest: Manifest = serde_json::from_value(json!({
        "launch": { "command": "java", "workdir": "${root}" },
        "artifacts": artifacts,
    }))
    .unwrap();
    let table = blobs
        .iter()
        .map(|(id, content)| (id.clone(), BlobSource::Bytes(content.clone())))
        .collect::<Blobs>();
    let mut out = Cursor::new(Vec::new());
    write_bundle(&mut out, &Head::default(), &manifest, &table).unwrap();
    Sample {
        bytes: out.into_inner(),
        manifest,
        blobs,
    }
}

/// The directory, read the way a reader with only ranges reads it: a small
/// tail first, and as much more as that says.
fn directory(bytes: &[u8], first: usize) -> (Directory, Vec<usize>) {
    let len = bytes.len() as u64;
    let mut asked = vec![first.min(bytes.len())];
    loop {
        let tail = &bytes[bytes.len() - asked.last().unwrap()..];
        match directory_from_back(tail, len).unwrap() {
            Back::Directory(directory) => return (directory, asked),
            Back::Needs(needs) => asked.push(needs as usize),
        }
    }
}

fn slice(bytes: &[u8], range: std::ops::Range<u64>) -> &[u8] {
    &bytes[range.start as usize..range.end as usize]
}

#[test]
fn a_bundle_is_read_from_its_directory_its_front_and_one_blob_at_a_time() {
    let sample = sample();
    let (directory, asked) = directory(&sample.bytes, 64 * 1024);
    assert_eq!(asked, [64 * 1024], "one tail holds a small directory");
    assert_eq!(directory.file_len(), sample.bytes.len() as u64);

    let front = directory.front().unwrap();
    assert_eq!(front.start, 0, "the head is the first entry");
    assert!(
        front.end < 2_000,
        "the front is the head and the manifest: {front:?}"
    );
    assert_eq!(
        directory.open(slice(&sample.bytes, front)).unwrap(),
        sample.manifest
    );

    for (id, content) in &sample.blobs {
        let entry = directory.blob(id).unwrap();
        assert_eq!(entry.size(), content.len() as u64);
        // However the bytes arrive, they decode to the blob.
        for piece in [1, 7, 4096, usize::MAX] {
            let mut decoder = entry.decoder(Vec::new());
            for chunk in slice(&sample.bytes, entry.range()).chunks(piece.min(1 << 24)) {
                decoder.write_all(chunk).unwrap();
            }
            decoder.flush().unwrap();
            assert_eq!(
                &decoder.finish().unwrap(),
                content,
                "{id} in pieces of {piece}"
            );
        }
    }
}

#[test]
fn a_tail_too_short_for_the_directory_asks_for_what_it_needs() {
    let sample = sample();
    // Too short for even the end record: it is asked for as far back as a
    // comment could push it, which here holds the whole directory too.
    let (_, asked) = directory(&sample.bytes, 10);
    assert_eq!(asked, [10, (22 + 65_535).min(sample.bytes.len())]);
    // The end record and no more: the directory it points at is asked for
    // exactly.
    let (directory, asked) = directory(&sample.bytes, 22);
    assert_eq!(asked.len(), 2, "{asked:?}");
    assert!(asked[1] > 22 && asked[1] < 2_000, "{asked:?}");
    let front = directory.front().unwrap();
    assert_eq!(
        directory.open(slice(&sample.bytes, front)).unwrap(),
        sample.manifest
    );
}

#[test]
fn what_is_not_a_bundle_says_so() {
    let error = |bytes: &[u8]| {
        directory_from_back(bytes, bytes.len() as u64)
            .unwrap_err()
            .to_string()
    };
    assert!(error(&noise(300, 3)).contains("has no zip directory"));
    assert!(directory_from_back(b"PK", 1)
        .unwrap_err()
        .to_string()
        .contains("shorter than its own tail"));

    // A zip, and not a bundle: no head, no manifest.
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    zip.start_file("readme.txt", zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(b"hi").unwrap();
    let bytes = zip.finish().unwrap().into_inner();
    let (directory, _) = directory(&bytes, 1 << 16);
    assert!(matches!(
        directory.front(),
        Err(BundleError::MissingEntry("opys.json"))
    ));
}

#[test]
fn a_front_or_a_blob_that_is_not_what_the_directory_says_is_refused() {
    let sample = sample();
    let (directory, _) = directory(&sample.bytes, 1 << 16);
    let front = directory.front().unwrap();

    // Cut short.
    let cut = &slice(&sample.bytes, front.clone())[..100];
    assert!(directory
        .open(cut)
        .unwrap_err()
        .to_string()
        .contains("shorter than its directory says"));

    let (id, _) = &sample.blobs[1];
    let entry = directory.blob(id).unwrap();
    let raw = slice(&sample.bytes, entry.range()).to_vec();
    let mut decoder = entry.decoder(Vec::new());
    decoder.write_all(&raw[..raw.len() / 2]).unwrap();
    assert!(decoder
        .finish()
        .unwrap_err()
        .to_string()
        .contains("ends before its data does"));

    // A byte changed inside a stored-as-deflated blob of noise: the deflate
    // stream still decodes, and the checksum catches it.
    let (id, _) = &sample.blobs[2];
    let entry = directory.blob(id).unwrap();
    let mut raw = slice(&sample.bytes, entry.range()).to_vec();
    let last = raw.len() - 3;
    raw[last] ^= 0x01;
    let mut decoder = entry.decoder(Vec::new());
    let wrote = decoder.write_all(&raw);
    assert!(wrote.is_err() || decoder.finish().is_err());

    // Not an entry at all.
    let mut decoder = entry.decoder(Vec::new());
    assert!(decoder.write_all(&[0; 64]).is_err());

    assert!(matches!(
        directory.blob(&"0".repeat(64)),
        Err(BundleError::MissingBlob(_))
    ));
}

#[test]
fn a_manifest_naming_a_blob_the_bundle_lacks_is_refused_on_open() {
    // A bundle written by hand, whose manifest names a blob nothing holds.
    let manifest = json!({
        "launch": { "command": "java", "workdir": "${root}" },
        "artifacts": [{ "path": "${root}/x", "source": { "blob": "1".repeat(64) } }],
    });
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("opys.json", stored).unwrap();
    zip.write_all(
        serde_json::to_string(&json!({ "format": BUNDLE_FORMAT }))
            .unwrap()
            .as_bytes(),
    )
    .unwrap();
    zip.start_file("manifest.json", stored).unwrap();
    zip.write_all(manifest.to_string().as_bytes()).unwrap();
    let bytes = zip.finish().unwrap().into_inner();

    let (directory, _) = directory(&bytes, 1 << 16);
    let front = directory.front().unwrap();
    assert!(matches!(
        directory.open(slice(&bytes, front)),
        Err(BundleError::MissingBlob(_))
    ));
}

#[test]
fn a_bundle_in_another_format_is_refused_before_its_manifest_is_read() {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("opys.json", stored).unwrap();
    zip.write_all(br#"{ "format": 99 }"#).unwrap();
    zip.start_file("manifest.json", stored).unwrap();
    zip.write_all(b"not even json").unwrap();
    let bytes = zip.finish().unwrap().into_inner();

    let (directory, _) = directory(&bytes, 1 << 16);
    let front = directory.front().unwrap();
    assert!(matches!(
        directory.open(slice(&bytes, front)),
        Err(BundleError::Format { found: 99 })
    ));
}

#[test]
fn an_entry_with_zip64_sizes_is_read_through_its_extra_field() {
    // `large_file` makes the writer keep an entry's sizes in a zip64 extra
    // field, as a bundle with a blob over 4 GiB has them.
    let body = noise(10_000, 11);
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let big = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(true);
    zip.start_file("opys.json", zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(br#"{ "format": 1 }"#).unwrap();
    zip.start_file(format!("blobs/{}", blob_id(&body)), big)
        .unwrap();
    zip.write_all(&body).unwrap();
    let bytes = zip.finish().unwrap().into_inner();

    let (directory, _) = directory(&bytes, 1 << 16);
    let entry = directory.blob(&blob_id(&body)).unwrap();
    let mut decoder = entry.decoder(Vec::new());
    decoder.write_all(slice(&bytes, entry.range())).unwrap();
    assert_eq!(decoder.finish().unwrap(), body);
}

// ── by hand: what no writer of ours makes, and a reader must still refuse ──

fn u16_at(bytes: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([bytes[at], bytes[at + 1]])
}

fn u32_at(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap())
}

/// Where a zip's end record is, and where each directory entry starts.
fn layout(bytes: &[u8]) -> (usize, Vec<usize>) {
    let end = bytes.len() - 22;
    assert_eq!(&bytes[end..end + 4], b"PK\x05\x06");
    let mut at = u32_at(bytes, end + 16) as usize;
    let mut entries = Vec::new();
    while at < end {
        entries.push(at);
        at += 46
            + usize::from(u16_at(bytes, at + 28))
            + usize::from(u16_at(bytes, at + 30))
            + usize::from(u16_at(bytes, at + 32));
    }
    (end, entries)
}

fn read_whole(bytes: &[u8]) -> Result<Back, BundleError> {
    directory_from_back(bytes, bytes.len() as u64)
}

fn refusal(bytes: &[u8]) -> String {
    read_whole(bytes).unwrap_err().to_string()
}

#[test]
fn a_directory_that_says_something_impossible_is_refused() {
    let sample = sample();
    let (end, entries) = layout(&sample.bytes);

    let mut encrypted = sample.bytes.clone();
    encrypted[entries[0] + 8] |= 1;
    assert!(refusal(&encrypted).contains("encrypted entry"));

    let mut miscounted = sample.bytes.clone();
    miscounted[end + 10] += 1;
    assert!(refusal(&miscounted).contains("does not hold the entries it counts"));

    // An entry whose data would run into the next one.
    let mut overlapping = sample.bytes.clone();
    overlapping[entries[0] + 20..entries[0] + 24].copy_from_slice(&1_000_000u32.to_le_bytes());
    assert!(refusal(&overlapping).contains("entries overlap"));

    // Two blobs under one name: both are 64-hex names, so one is renamed in
    // place.
    let mut twice = sample.bytes.clone();
    let name = |at: usize| at + 46..at + 46 + usize::from(u16_at(&sample.bytes, at + 28));
    let first = sample.bytes[name(entries[2])].to_vec();
    twice[name(entries[3])].copy_from_slice(&first);
    assert!(refusal(&twice).contains("names one entry twice"));

    let mut not_utf8 = sample.bytes.clone();
    not_utf8[entries[0] + 46] = 0xff;
    assert!(refusal(&not_utf8).contains("not UTF-8"));

    let mut not_an_entry = sample.bytes.clone();
    not_an_entry[entries[1]] = b'X';
    assert!(refusal(&not_an_entry).contains("not an entry"));

    // A directory said to run past the end record.
    let mut too_long = sample.bytes.clone();
    too_long[end + 12..end + 16].copy_from_slice(&u32::MAX.to_le_bytes()[..4]);
    too_long[end + 12] = 0xfe;
    assert!(refusal(&too_long).contains("runs past its end"));
}

#[test]
fn an_entry_compressed_some_other_way_is_refused_when_decoded() {
    let sample = sample();
    let (_, entries) = layout(&sample.bytes);
    let mut bzip = sample.bytes.clone();
    bzip[entries[2] + 10] = 12;
    let Back::Directory(directory) = read_whole(&bzip).unwrap() else {
        panic!("the whole file was given");
    };
    let entry = directory.blob(&sample.blobs[0].0).unwrap();
    let mut decoder = entry.decoder(Vec::new());
    let error = decoder.write_all(slice(&bzip, entry.range())).unwrap_err();
    assert!(error.to_string().contains("compressed in a way"));
}

/// A classic zip rewritten as a zip64 one: the same directory, its numbers
/// moved to a zip64 end record, as a writer must for a bundle past 4 GiB or
/// 65 535 entries.
fn as_zip64(bytes: &[u8]) -> Vec<u8> {
    let end = bytes.len() - 22;
    let (count, size, offset) = (
        u64::from(u16_at(bytes, end + 10)),
        u64::from(u32_at(bytes, end + 12)),
        u64::from(u32_at(bytes, end + 16)),
    );
    let mut out = bytes[..end].to_vec();
    let record = out.len() as u64;
    out.extend_from_slice(b"PK\x06\x06");
    out.extend_from_slice(&44u64.to_le_bytes());
    out.extend_from_slice(&[45, 0, 45, 0]);
    out.extend_from_slice(&[0; 8]);
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&size.to_le_bytes());
    out.extend_from_slice(&offset.to_le_bytes());
    out.extend_from_slice(b"PK\x06\x07");
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&record.to_le_bytes());
    out.extend_from_slice(&1u32.to_le_bytes());
    out.extend_from_slice(b"PK\x05\x06");
    out.extend_from_slice(&[0; 4]);
    out.extend_from_slice(&[0xff; 4]);
    out.extend_from_slice(&[0xff; 8]);
    out.extend_from_slice(&[0; 2]);
    out
}

#[test]
fn a_zip64_bundle_is_read_through_its_zip64_end_record() {
    let sample = sample();
    let zip64 = as_zip64(&sample.bytes);
    let (directory, asked) = directory(&zip64, 64 * 1024);
    assert_eq!(asked.len(), 1);
    let front = directory.front().unwrap();
    assert_eq!(
        directory.open(slice(&zip64, front)).unwrap(),
        sample.manifest
    );

    // A tail that has the locator and not the record it points at.
    let Back::Needs(needs) =
        directory_from_back(&zip64[zip64.len() - 42..], zip64.len() as u64).unwrap()
    else {
        panic!("the record is further back");
    };
    assert_eq!(needs, 42 + 56);

    let mut no_locator = zip64.clone();
    let locator = no_locator.len() - 42;
    no_locator[locator] = b'X';
    assert!(refusal(&no_locator).contains("has no locator"));

    let mut misplaced = zip64.clone();
    let record = misplaced.len() - 42 - 56;
    misplaced[record] = b'X';
    assert!(refusal(&misplaced).contains("not where its locator says"));
}

/// Decode `raw` in pieces, taking what has been written after each, and
/// with a trailer after the data, as some writers leave one.
fn decode_in_pieces(entry: &opys_bundle::Entry, raw: &[u8]) -> Vec<u8> {
    let mut taken = Vec::new();
    let mut decoder = entry.decoder(Vec::new());
    decoder.flush().unwrap();
    for chunk in raw.chunks(10_000) {
        decoder.write_all(chunk).unwrap();
        decoder.flush().unwrap();
        taken.append(decoder.get_mut());
    }
    decoder.write_all(b"PK\x07\x08trailer").unwrap();
    decoder.flush().unwrap();
    taken.append(decoder.get_mut());
    taken.extend(decoder.finish().unwrap());
    taken
}

#[test]
fn a_decoder_hands_over_what_it_has_at_any_point() {
    // A deflated blob, as a bundle stores one.
    let sample = sample();
    let (bundle, _) = directory(&sample.bytes, 1 << 16);
    let (id, content) = &sample.blobs[1];
    let blob = bundle.blob(id).unwrap();
    assert_eq!(
        &decode_in_pieces(blob, slice(&sample.bytes, blob.range())),
        content
    );

    // And a stored one, as the head is.
    let body = noise(50_000, 13);
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file(format!("blobs/{}", blob_id(&body)), stored)
        .unwrap();
    zip.write_all(&body).unwrap();
    let bytes = zip.finish().unwrap().into_inner();
    let (directory, _) = directory(&bytes, 1 << 16);
    let entry = directory.blob(&blob_id(&body)).unwrap();
    assert_eq!(decode_in_pieces(entry, slice(&bytes, entry.range())), body);
}

#[test]
fn an_empty_stored_entry_decodes_to_nothing() {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("opys.json", stored).unwrap();
    zip.write_all(br#"{ "format": 1 }"#).unwrap();
    let empty = blob_id(b"");
    zip.start_file(format!("blobs/{empty}"), stored).unwrap();
    let bytes = zip.finish().unwrap().into_inner();

    let (directory, _) = directory(&bytes, 1 << 16);
    let entry = directory.blob(&empty).unwrap();
    let mut decoder = entry.decoder(Vec::new());
    // The header in two pieces, the second ending exactly where it does.
    let raw = slice(&bytes, entry.range());
    decoder.write_all(&raw[..10]).unwrap();
    decoder.flush().unwrap();
    assert!(decoder.get_mut().is_empty());
    decoder.write_all(&raw[10..]).unwrap();
    decoder.flush().unwrap();
    assert_eq!(decoder.finish().unwrap(), b"");
}

#[test]
fn an_extra_field_that_is_not_zip64_is_stepped_over() {
    let body = noise(1_000, 12);
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let mut options = zip::write::FileOptions::<zip::write::ExtendedFileOptions>::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(true);
    options
        .add_extra_data(0xcafe, vec![1, 2, 3].into_boxed_slice(), false)
        .unwrap();
    zip.start_file(format!("blobs/{}", blob_id(&body)), options)
        .unwrap();
    zip.write_all(&body).unwrap();
    let bytes = zip.finish().unwrap().into_inner();

    let (directory, _) = directory(&bytes, 1 << 16);
    let entry = directory.blob(&blob_id(&body)).unwrap();
    let mut decoder = entry.decoder(Vec::new());
    decoder.write_all(slice(&bytes, entry.range())).unwrap();
    assert_eq!(decoder.finish().unwrap(), body);
}
