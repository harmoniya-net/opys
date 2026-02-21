# Mapping Rust to TypeScript with Zod

This guide outlines the patterns and best practices used in this project to map Rust code (specifically patterns from `serde`, `derive_satisfies`, and standard traits) to TypeScript using the `zod` library.

## Core Philosophical Alignment

We treat TypeScript as a "compiled" target for Rust's data structures. We aim for:

1. **Type Safety**: Mirroring Rust's strict typing as closely as possible.
2. **Structural Parity**: Maintaining the same nested structures to ease mental context switching.
3. **Internal vs. External Models**: Distinguishing between how data is stored/transmitted ("Shadow") and how it is used internally.

---

## 1. Structs to Classes

In Rust, structs define both data and behavior. In our TypeScript implementation, we use Classes with a static `CODEC` property.

### Rust

```rust
pub struct MavenName {
    pub group_id: String,
    pub artifact_id: String,
}

impl MavenName {
    pub fn is_native(&self) -> bool { ... }
}
```

### TypeScript

```typescript
export class MavenName {
  constructor(
    public readonly groupId: string,
    public readonly artifactId: string,
  ) {}

  public isNative(): boolean { ... }

  public static readonly CODEC = z.codec(...);
}
```

---

## 2. Serialization and `z.codec`

We use `z.codec` to handle the gap between raw JSON data and our internal class instances. This is analogous to `#[derive(Serialize, Deserialize)]` or custom `serde` implementations.

### Pattern: The "Shadow" Pattern

When the external JSON format differs from our internal structural needs (e.g., Minecraft's nested `downloads` vs our flat `Library` list), we define a "Shadow" schema.

### Example: `Libraries` Mapping

Rust's `try_from` logic is implemented inside the `decode` function of a Zod codec.

```typescript
// The "External" or "Shadow" data structure
const ShadowLibrarySchema = z.object({
  downloads: z.object({ ... }),
  name: MavenNameSchema,
});

export const LibrariesSchema = z.codec(
  z.array(ShadowLibrarySchema), // Source (JSON)
  z.instanceof(Libraries),      // Target (Internal Class)
  {
    decode(shadows) {
      const result = shadows.flatMap(s => transform(s)); // COMMENT: Double check if this needed eg @assets.ts
      return new Libraries(result);
    },
    encode(libs) {
      return libs.values; // Or complex reconstruction if needed
    },
  }
);
```

---

## 3. Enums and Traits

### Iterators (`IntoIterator`)

We map Rust's `IntoIterator` to TypeScript's `[Symbol.iterator]`. This allows the class to be used directly in `for...of` loops.

```typescript
export class Libraries {
  constructor(public readonly values: Library[]) {}

  public [Symbol.iterator]() {
    return this.values[Symbol.iterator]();
  }
}
```

### Satisfies (`#[derive(Satisfies)]`)

We use the `@unipack/rules` package to handle rule satisfaction. The `RuleSetSchema` and `Satisfies` logic should be integrated into the codec or used during runtime evaluation.

// COMMENT: No, we just will add satisfies(options, feats) method to our classes, it will dedicate the work to inner field like rule or other field that implement satisfies. not a codec integration

---

## 4. Key Differences and Gotchas

- **CamelCase vs snake_case**: TypeScript uses `camelCase` for properties, while Rust typically uses `snake_case`. Our codecs bridge this gap by mapping property names during `decode`/`encode`.
- **Exhaustiveness**: Unlike Rust's `match`, TypeScript enums/unions require careful handling (often using `z.discriminatedUnion`) to ensure all cases are handled.
- **Async**: Codecs in this project are typically synchronous. For async fetching (like `fetch()` in Rust), we move that logic to static class methods (e.g., `AssetIndex.fetch()`).
