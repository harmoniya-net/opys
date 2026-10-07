# TODO

## Pre-1.6 Minecraft has no sounds

Before 1.6 the game reads its assets from `<gameDir>/resources/` by name, not
from the hashed `assets/objects/` store, and fetches them itself from a bucket
Mojang retired (`s3.amazonaws.com/MinecraftResources`). opys has no mapper that
lays the asset index out under `resources/`, so those versions launch and run
silent. Seen on Forge 1.1 and 1.2.5; it is vanilla's gap, not the loader's.
