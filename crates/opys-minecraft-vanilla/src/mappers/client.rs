use opys_core::{Artifact, HashEntry, Integrity, Source};
use opys_mojang::Client;

/// The vanilla client jar.
pub fn map_client_jar(client: &Client) -> Artifact {
    Artifact {
        path: "${version_dir}/client.jar".to_owned(),
        source: Source::Url {
            url: client.downloads.client.url.clone(),
        },
        size: Some(client.downloads.client.size),
        rules: Vec::new(),
        integrity: Some(Integrity::One(HashEntry::Sha1 {
            sha1: client.downloads.client.sha1.clone(),
        })),
        discovery: None,
        metadata: None,
        extract: None,
    }
}
