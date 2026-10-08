# To do

Things decided on and not yet done. One entry each: what, and why it matters.

- **A lockfile.** `forge({ version: '1.20.1' })` resolves to whatever is
  newest when the build runs, so one config gives a different bundle next
  month and nothing records which builds a given bundle was made from. Keep
  each plugin's resolved contribution in a file beside the config, build from
  those files, and go back to the network only when asked to. A draft that
  did this (a Rust CLI over contribution files) built a Forge pack from them
  in 0.2 s and matched the manifest the current build produces.
