//! A project's version, named as its author names it: by number where the
//! number is one version's, and never by a guess where it is two.

mod common;

use common::{Reply, TestServer};
use opys_modrinth::resolve_modrinth_project_file;
use serde_json::{json, Value};

fn version(id: &str, number: &str, loaders: &[&str], game_versions: &[&str]) -> Value {
    json!({
        "id": id,
        "project_id": "AANobbMI",
        "version_number": number,
        "loaders": loaders,
        "game_versions": game_versions,
        "files": [{
            "hashes": { "sha1": "a".repeat(40) },
            "url": format!("https://cdn.modrinth.test/{id}.jar"),
            "filename": format!("{id}.jar"),
            "primary": true,
            "size": 10,
        }],
    })
}

fn project(versions: Vec<Value>) -> TestServer {
    TestServer::start(move |_| Reply::json(json!(versions).to_string()))
}

#[test]
fn a_number_only_one_version_has_is_that_version() {
    let server = project(vec![
        version("aaa", "1.0", &["minecraft"], &["1.21.1"]),
        version("bbb", "2.0", &["minecraft"], &["1.21.1"]),
    ]);
    let file = resolve_modrinth_project_file("faithful 32x", "2.0", None, &server.base).unwrap();
    assert_eq!(file.version_id, "bbb");
    assert_eq!(file.filename, "bbb.jar");
    assert_eq!(
        server.targets(),
        ["/project/faithful%2032x/version?include_changelog=false"]
    );
}

#[test]
fn a_shared_number_is_told_apart_by_its_loader() {
    let server = project(vec![
        version("fab", "1.0", &["fabric", "quilt"], &["1.21.1"]),
        version("neo", "1.0", &["neoforge"], &["1.21.1"]),
    ]);
    let resolve =
        |loader: Option<&str>| resolve_modrinth_project_file("x", "1.0", loader, &server.base);

    assert_eq!(resolve(Some("neoforge")).unwrap().version_id, "neo");
    assert_eq!(resolve(Some("quilt")).unwrap().version_id, "fab");

    // With no loader said there are two, and neither is picked.
    let message = resolve(None).unwrap_err().to_string();
    assert!(
        message.contains("more than one version \"1.0\""),
        "{message}"
    );
    assert!(message.contains("say its loader"), "{message}");
    assert!(message.contains("fab (fabric, quilt; 1.21.1)"), "{message}");
    assert!(message.contains("neo (neoforge; 1.21.1)"), "{message}");
}

#[test]
fn a_loader_is_a_filter_whether_or_not_the_number_is_shared() {
    let server = project(vec![
        version("neo", "1.0-neoforge", &["neoforge"], &["1.21.1"]),
        version("one", "2.0", &["fabric"], &["1.21.1"]),
        version("two", "2.0", &["fabric"], &["1.21.1"]),
    ]);
    let resolve = |version: &str, loader: Option<&str>| {
        resolve_modrinth_project_file("x", version, loader, &server.base)
    };
    // The only version of its number, and still not the one asked for.
    for named in ["1.0-neoforge", "neo"] {
        let message = resolve(named, Some("fabric")).unwrap_err().to_string();
        assert!(message.contains("for fabric; it has:"), "{message}");
        assert!(message.contains("neo (neoforge; 1.21.1)"), "{message}");
    }
    // Two of one number and one loader: only an id tells them apart.
    let message = resolve("2.0", Some("fabric")).unwrap_err().to_string();
    assert!(
        message.contains("more than one version \"2.0\"; name one by its id:"),
        "{message}"
    );
    assert_eq!(resolve("two", Some("fabric")).unwrap().version_id, "two");
}

#[test]
fn a_version_the_project_has_not_got_and_a_project_there_is_not() {
    let server = project(vec![version("aaa", "1.0", &["fabric"], &["1.21.1"])]);
    let message = resolve_modrinth_project_file("x", "9.9", None, &server.base)
        .unwrap_err()
        .to_string();
    assert_eq!(message, "Modrinth project \"x\" has no version \"9.9\"");

    let missing = TestServer::start(|_| Reply::status(404));
    let message = resolve_modrinth_project_file("nope", "1.0", None, &missing.base)
        .unwrap_err()
        .to_string();
    assert!(message.contains("404"), "{message}");
}
