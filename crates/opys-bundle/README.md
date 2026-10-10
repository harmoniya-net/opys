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
println!("format {}, {} options", head.format, head.options.as_slice().len());

let mut bundle = open_bundle(std::fs::File::open("server.opys")?)?;
println!("{} artifacts", bundle.manifest().artifacts.len());
```

`write_bundle` writes one from a `Head`, a `Manifest` and a table of where
its blobs are. A bundle in any format but `BUNDLE_FORMAT` is refused, and so
is one that names a blob it does not hold.

The head also holds the bundle's `Options`: the variables and features a
player may set, each an `OptionDef` with what a launcher needs to draw it.
A tree that names a variable twice, or a slider whose default is outside its
range, does not decode.

- [`opys-core`](https://crates.io/crates/opys-core) is the manifest a
  bundle carries.
- [`opys-runtime`](https://crates.io/crates/opys-runtime) installs and
  launches from a bundle.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
