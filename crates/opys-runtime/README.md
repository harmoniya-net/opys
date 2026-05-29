# opys-runtime

[![Crates.io](https://img.shields.io/crates/v/opys-runtime.svg)](https://crates.io/crates/opys-runtime)

Install + launch executor — consumes a frozen `Manifest` from
[`opys-core`](https://crates.io/crates/opys-core), runs the
resolve → pointer → discovery → scan → fetch → verify → extract →
sweep pipeline, then spawns the configured process.

```toml
[dependencies]
opys-runtime = { version = "0.1", features = [] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

```rust
use opys_runtime::{install, launch, ManifestSource, InstallOptions, LaunchOptions};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    install(
        ManifestSource::Path("opys.json".into()),
        InstallOptions::new(),
    ).await?;

    let mut opts = LaunchOptions::new();
    opts.do_install = false;
    let child = launch(ManifestSource::Path("opys.json".into()), &opts).await?;
    let status = child.wait_with_output().await?;
    println!("exited with {}", status.status);
    Ok(())
}
```

The runtime depends **only** on `opys-core` among opys crates — it
is a clean reimplementation target.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
