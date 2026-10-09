//! The bytes are checked against what `nbtify` — the encoder the TypeScript
//! implementation used — wrote for the same lists.

use base64::Engine;
use opys_bundle::{blob_id, BlobSource};
use opys_core::Artifact;
use opys_minecraft_serverlist::{
    build_serverlist, encode_servers_dat, serverlist, ServerEntry, ServerlistOptions,
    DEFAULT_SERVERLIST_PATH,
};
use serde_json::{json, Value};

fn entries(raw: Value) -> Vec<ServerEntry> {
    serde_json::from_value(raw).unwrap()
}

fn encode(servers: &[(&str, &str)]) -> Vec<u8> {
    encode_servers_dat(servers.iter().copied())
}

fn base64(text: &str) -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(text)
        .unwrap()
}

/// Artifact `index` as the merge makes it — a blob artifact — and the bytes
/// it carries.
fn resolved(contribution: &opys_dev::Contribution, index: usize) -> (Artifact, Vec<u8>) {
    match contribution.artifacts[index].clone().resolve().unwrap() {
        (artifact, Some((_, BlobSource::Bytes(bytes)))) => (artifact, bytes),
        other => panic!("a generated list is carried as bytes, not {other:?}"),
    }
}

fn bytes_of(contribution: &opys_dev::Contribution, index: usize) -> Vec<u8> {
    resolved(contribution, index).1
}

// ── the encoding, against the one it replaced ─────────────────────────────

#[test]
fn an_empty_list_is_the_bytes_nbtify_wrote() {
    assert_eq!(encode(&[]), base64("CgAACQAHc2VydmVycwAAAAAAAA=="));
}

#[test]
fn a_list_with_awkward_names_is_the_bytes_nbtify_wrote() {
    // An accent, an emoji outside the BMP, and a NUL: the three places Java's
    // modified UTF-8 is not UTF-8.
    let servers = [("Home", "play.example"), ("Ünï 🎮 \u{0}x", "1.2.3.4:25565")];
    assert_eq!(
        encode(&servers),
        base64("CgAACQAHc2VydmVycwoAAAACCAAEbmFtZQAESG9tZQgAAmlwAAxwbGF5LmV4YW1wbGUACAAEbmFtZQAQw5xuw68g7aC87b6uIMCAeAgAAmlwAA0xLjIuMy40OjI1NTY1AAA=")
    );
}

#[test]
fn the_layout_is_a_root_compound_holding_one_list_of_compounds() {
    let bytes = encode(&[("One", "a"), ("Two", "b"), ("Three", "c")]);
    assert_eq!(bytes[0], 0x0a, "root is a compound");
    assert_eq!(&bytes[1..3], [0, 0], "and has no name");
    assert_eq!(bytes[3], 0x09, "its one member is a list");
    assert_eq!(&bytes[6..13], b"servers");
    assert_eq!(bytes[13], 0x0a, "of compounds");
    assert_eq!(i32::from_be_bytes(bytes[14..18].try_into().unwrap()), 3);
    assert_eq!(bytes.last(), Some(&0), "and the root is closed");
}

#[test]
fn an_encoded_string_never_contains_a_zero_byte() {
    let bytes = encode(&[("a\u{0}b", "x")]);
    let name = bytes.windows(4).position(|w| w == [b'a', 0xc0, 0x80, b'b']);
    assert!(name.is_some(), "NUL is written as C0 80");
}

#[test]
fn a_name_too_long_for_nbt_is_cut_at_a_whole_character() {
    // 3 bytes each: 65535 is divisible by 3, so one more is one too many.
    let long = "€".repeat(21_846);
    let bytes = encode(&[(&long, "x")]);
    // root(3) + list header(15) + "name" tag(7) → the length prefix.
    let at = 3 + 15 + 7;
    let length = usize::from(u16::from_be_bytes([bytes[at], bytes[at + 1]]));
    assert_eq!(length, 65_535);
    assert_eq!(&bytes[at + 2 + length - 3..at + 2 + length], "€".as_bytes());

    // Two bytes each: the limit falls mid-character, and the cut steps back.
    let odd = "é".repeat(40_000);
    let bytes = encode(&[(&odd, "x")]);
    assert_eq!(u16::from_be_bytes([bytes[at], bytes[at + 1]]), 65_534);
}

// ── the plugin ────────────────────────────────────────────────────────────

#[test]
fn entries_without_rules_are_one_file_at_the_default_path() {
    let servers = entries(json!([{ "name": "A", "ip": "a" }, { "name": "B", "ip": "b" }]));
    let contribution = serverlist(&servers, &ServerlistOptions::default());
    assert_eq!(contribution.artifacts.len(), 1);
    let (artifact, bytes) = resolved(&contribution, 0);
    assert_eq!(artifact.path, DEFAULT_SERVERLIST_PATH);
    assert!(artifact.rules.is_empty());

    assert_eq!(bytes, encode(&[("A", "a"), ("B", "b")]));
    // The artifact is the blob: named by its hash, sized by its length.
    assert_eq!(artifact.blob_id(), Some(blob_id(&bytes).as_str()));
    assert_eq!(artifact.size, Some(bytes.len() as u64));
    assert_eq!(
        serde_json::to_value(&artifact).unwrap(),
        json!({ "path": DEFAULT_SERVERLIST_PATH, "source": { "blob": blob_id(&bytes) }, "size": bytes.len() })
    );
}

#[test]
fn no_servers_is_still_a_file_holding_an_empty_list() {
    let contribution = serverlist(&[], &ServerlistOptions::default());
    assert_eq!(contribution.artifacts.len(), 1);
    assert_eq!(bytes_of(&contribution, 0), encode(&[]));
}

#[test]
fn a_custom_path_is_where_every_file_goes() {
    let options: ServerlistOptions =
        serde_json::from_value(json!({ "path": "custom/servers.dat" })).unwrap();
    let servers = entries(json!([
        { "name": "A", "ip": "a" },
        { "name": "L", "ip": "l", "rules": "allow.os.linux" },
    ]));
    let contribution = serverlist(&servers, &options);
    assert!(contribution
        .artifacts
        .iter()
        .all(|a| a.path() == Some("custom/servers.dat")));
}

#[test]
fn each_distinct_ruleset_gets_its_own_file_in_the_order_it_first_appears() {
    let servers = entries(json!([
        { "name": "Always", "ip": "always" },
        { "name": "Linux", "ip": "linux", "rules": "allow.os.linux" },
        { "name": "Win", "ip": "win", "rules": "allow.os.windows" },
        // Written the long way, and later: the same ruleset as `Linux`.
        { "name": "Linux2", "ip": "linux2", "rules": [{ "action": "allow", "os": { "name": "linux" } }] },
        { "name": "Always2", "ip": "always2", "rules": [] },
    ]));
    let contribution = serverlist(&servers, &ServerlistOptions::default());

    let rules: Vec<Value> = contribution
        .artifacts
        .iter()
        .map(|a| serde_json::to_value(a).unwrap()["rules"].clone())
        .collect();
    assert_eq!(
        rules,
        [
            Value::Null,
            json!("allow.os.linux"),
            json!("allow.os.windows")
        ]
    );

    assert_eq!(
        bytes_of(&contribution, 0),
        encode(&[("Always", "always"), ("Always2", "always2")])
    );
    assert_eq!(
        bytes_of(&contribution, 1),
        encode(&[("Linux", "linux"), ("Linux2", "linux2")])
    );
    assert_eq!(bytes_of(&contribution, 2), encode(&[("Win", "win")]));
}

#[test]
fn the_plugin_is_named_serverlist_and_contributes_only_files() {
    let output = build_serverlist(
        &entries(json!([{ "name": "A", "ip": "a" }])),
        &ServerlistOptions::default(),
    );
    assert_eq!(output.name, "serverlist");
    assert!(output.contribution.vars.is_empty());
    assert!(output.contribution.launch.is_empty());
}

#[test]
fn the_same_list_is_the_same_blob() {
    let servers = entries(json!([{ "name": "A", "ip": "a" }]));
    let once = serverlist(&servers, &ServerlistOptions::default());
    let twice = serverlist(&servers, &ServerlistOptions::default());
    assert_eq!(once, twice);
}

// ── what is refused ───────────────────────────────────────────────────────

#[test]
fn a_rule_that_does_not_parse_and_a_field_that_is_not_one_are_refused() {
    let bad_rule = json!([{ "name": "A", "ip": "a", "rules": "allow.nonsense" }]);
    assert!(serde_json::from_value::<Vec<ServerEntry>>(bad_rule).is_err());
    let typo = json!([{ "name": "A", "address": "a" }]);
    assert!(serde_json::from_value::<Vec<ServerEntry>>(typo).is_err());
    assert!(serde_json::from_value::<ServerlistOptions>(json!({ "pth": "x" })).is_err());
}
