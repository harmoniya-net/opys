use opys_core::{Artifact, ExtractDump, ExtractRule, HashEntry, Integrity, Source};
use opys_mojang::Library;

pub fn library_to_artifact(lib: &Library) -> Artifact {
    let extract = lib.native.then(|| {
        vec![ExtractRule::Dump(ExtractDump {
            into: "${natives_directory}".to_owned(),
            clean: Some(true),
            includes: None,
            excludes: Some(vec!["META-INF/".to_owned()]),
        })]
    });

    // Upstream version manifests occasionally ship a real `url` alongside a
    // placeholder `sha1: ""` / `size: 0` — e.g. lwjgl3ify 3.0.25's
    // `lzma:lzma:0.0.1`. An empty string is not a hash and a zero is not a jar
    // size; baking them in would hand the verifier a target it can only ever
    // fail. Emit the artifact without those probes instead (the jar still
    // downloads, just unverified) — same stance as the repo-lib path in
    // `@opys/lwjgl3ify`. `size`/`integrity` are optional on `Artifact` for
    // exactly this "no probe available" case.
    Artifact {
        path: format!("${{library_directory}}/{}", lib.artifact.path),
        source: Source::Url {
            url: lib.artifact.url.clone(),
        },
        size: (lib.artifact.size > 0).then_some(lib.artifact.size),
        rules: lib.rules.clone(),
        integrity: (!lib.artifact.sha1.is_empty()).then(|| {
            Integrity::One(HashEntry::Sha1 {
                sha1: lib.artifact.sha1.clone(),
            })
        }),
        discovery: None,
        metadata: None,
        extract,
    }
}

pub fn map_libraries(libs: &[Library]) -> Vec<Artifact> {
    libs.iter().map(library_to_artifact).collect()
}
