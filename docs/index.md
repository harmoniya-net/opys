---
layout: home

hero:
  name: opys
  text: A Minecraft installation, described once
  tagline: Write a config. Get one file that installs and launches the game anywhere.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Concepts
      link: /guide/concepts
    - theme: alt
      text: GitHub
      link: https://github.com/harmoniya-net/opys

features:
  - title: Building a pack
    details: Compose a loader, a Java runtime and your mods in a config file, and launch it. Every Forge since 1.1, NeoForge, Fabric, Cleanroom and lwjgl3ify.
    link: /guide/getting-started
    linkText: The guide
  - title: Building a launcher
    details: Hand the runtime a bundle and it installs and starts the game, reporting progress and typed errors. It needs nothing else from opys.
    link: /launcher/embedding
    linkText: Embedding the runtime
  - title: Reading the format
    details: A bundle is a zip and a manifest is JSON. Everything is resolved and pinned at build time, so an installer downloads, verifies and looks nothing up.
    link: /reference/bundle-format
    linkText: The bundle format
---
