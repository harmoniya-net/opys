# opys-runtime

[![Crates.io](https://img.shields.io/crates/v/opys-runtime.svg)](https://crates.io/crates/opys-runtime)

Install + launch executor — consumes a bundle, or a `Manifest` and its blobs,
from [`opys-core`](https://crates.io/crates/opys-core), runs the
resolve → scan → fetch → verify → extract → cleanup pipeline, then spawns the configured process.

```sh
cargo add opys-runtime
cargo add tokio --features macros,rt-multi-thread
```

```rust
use opys_runtime::{install, launch, ManifestSource, InstallOptions, LaunchOptions};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // A bundle on disk. `ManifestSource::url` downloads one first, and
    // `ManifestSource::Manifest { manifest, blobs }` installs from memory.
    install(ManifestSource::bundle("server.opys"), InstallOptions::new()).await?;

    let mut opts = LaunchOptions::new();
    opts.do_install = false;
    let child = launch(ManifestSource::bundle("server.opys"), opts).await?;
    let status = child.wait_with_output().await?;
    println!("exited with {}", status.status);
    Ok(())
}
```

The runtime depends **only** on `opys-core` among opys crates — it
is a clean reimplementation target.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
