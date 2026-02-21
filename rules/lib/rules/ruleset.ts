import { Schema } from 'effect';
import { Enums, Struct, Union } from 'effect/Schema';

export enum RuleOsName {
  Linux = 'linux',
  Windows = 'windows',
  Osx = 'osx',
}

export const RuleOsNameSchema = Enums(RuleOsName).annotations({
  message: () => "Unknown OS name, expected 'linux', 'windows', or 'osx'",
});

export enum RuleOsArch {
  X86 = 'x86',
  X86_64 = 'x86_64',
  ARM = 'arm',
  AARCH64 = 'aarch64',
  ANY = 'any',
}

export const RuleOsArchSchema = Enums(RuleOsArch).annotations({
  message: () =>
    "Unknown OS architecture, expected 'x86', 'x86_64', 'arm', or 'aarch64'",
});

export enum RuleAction {
  Allow = 'allow',
  Disallow = 'disallow',
}

export const RuleActionSchema = Enums(RuleAction).annotations({
  message: () => "Unknown action, expected 'allow' or 'disallow'",
});

export const RuleOsSchema = Union(
  Struct({
    name: RuleOsNameSchema,
    version: Schema.String,
  }),
  Struct({
    name: RuleOsNameSchema,
  }),
  Struct({
    arch: Enums(RuleOsArch),
  }),
);

export type RuleOs = Schema.Schema.Type<typeof RuleOsSchema>;

export const FeatureMapSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Boolean,
});

export type FeatureMap = Schema.Schema.Type<typeof FeatureMapSchema>;

export const RuleSchema = Union(
  Struct({
    action: RuleActionSchema,
    os: RuleOsSchema,
  }),
  Struct({
    action: RuleActionSchema,
    features: FeatureMapSchema,
  }),
  Struct({
    action: RuleActionSchema,
  }),
);

export type Rule = Schema.Schema.Type<typeof RuleSchema>;

export const RuleSetSchema = Schema.Array(RuleSchema);
export type RuleSet = Schema.Schema.Type<typeof RuleSetSchema>;
