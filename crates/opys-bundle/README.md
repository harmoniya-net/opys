# opys-bundle

[![Crates.io](https://img.shields.io/crates/v/opys-bundle.svg)](https://crates.io/crates/opys-bundle)

The opys bundle: a manifest and the blobs it names, as one zip.

```sh
cargo add opys-bundle
```

```rust
use opys_bundle::{open_bundle, read_bundle_head};

// opys.json (the head), manifest.json (the manifest), blobs/<sha256>.
let head = read_bundle_head(std::fs::File::open("server.opys")?)?;
println!("format {}", head.format);

let mut bundle = open_bundle(std::fs::File::open("server.opys")?)?;
println!("{} artifacts", bundle.manifest().artifacts.len());
```

`write_bundle` writes one from a `Manifest` and a table of where its blobs
are. A bundle in any format but `BUNDLE_FORMAT` is refused, and so is one
that names a blob it does not hold.

- [`opys-core`](https://crates.io/crates/opys-core) is the manifest a
  bundle carries.
- [`opys-runtime`](https://crates.io/crates/opys-runtime) installs and
  launches from a bundle.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
