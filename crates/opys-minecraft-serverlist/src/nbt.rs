//! Exactly as much NBT as a `servers.dat` is: an unnamed root compound
//! holding one list of `{ name, ip }` compounds, uncompressed and big-endian.

const TAG_END: u8 = 0;
const TAG_STRING: u8 = 8;
const TAG_LIST: u8 = 9;
const TAG_COMPOUND: u8 = 10;

/// Java's "modified UTF-8", which is what NBT strings are and what
/// `DataInput.readUTF` reads. It differs from UTF-8 in two places: NUL is two
/// bytes, so an encoded string never contains a zero byte, and a character
/// outside the BMP is its two UTF-16 surrogates, each encoded as three bytes.
fn modified_utf8(text: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(text.len());
    for unit in text.encode_utf16() {
        match unit {
            0x0001..=0x007f => out.push(unit as u8),
            0x0000 | 0x0080..=0x07ff => {
                out.push(0xc0 | (unit >> 6) as u8);
                out.push(0x80 | (unit & 0x3f) as u8);
            }
            _ => {
                out.push(0xe0 | (unit >> 12) as u8);
                out.push(0x80 | ((unit >> 6) & 0x3f) as u8);
                out.push(0x80 | (unit & 0x3f) as u8);
            }
        }
    }
    out
}

/// A length-prefixed string. The prefix is 16 bits, which is NBT's limit and
/// not ours: a name longer than that could not be read back by the game, so
/// it is cut at the last whole character that fits.
fn put_string(out: &mut Vec<u8>, text: &str) {
    let mut bytes = modified_utf8(text);
    if bytes.len() > usize::from(u16::MAX) {
        let mut end = usize::from(u16::MAX);
        // Step back off a continuation byte so no character is split.
        while bytes[end] & 0xc0 == 0x80 {
            end -= 1;
        }
        bytes.truncate(end);
    }
    out.extend_from_slice(&(bytes.len() as u16).to_be_bytes());
    out.extend_from_slice(&bytes);
}

fn put_named(out: &mut Vec<u8>, tag: u8, name: &str) {
    out.push(tag);
    put_string(out, name);
}

/// Encode `servers` (name, ip) as a `servers.dat`.
pub fn encode_servers_dat<'a>(
    servers: impl ExactSizeIterator<Item = (&'a str, &'a str)>,
) -> Vec<u8> {
    let mut out = Vec::new();
    put_named(&mut out, TAG_COMPOUND, "");
    put_named(&mut out, TAG_LIST, "servers");
    // An empty list has no element type to speak of; NBT writes it as End.
    out.push(if servers.len() == 0 {
        TAG_END
    } else {
        TAG_COMPOUND
    });
    out.extend_from_slice(&(servers.len() as i32).to_be_bytes());
    for (name, ip) in servers {
        put_named(&mut out, TAG_STRING, "name");
        put_string(&mut out, name);
        put_named(&mut out, TAG_STRING, "ip");
        put_string(&mut out, ip);
        out.push(TAG_END);
    }
    out.push(TAG_END);
    out
}
