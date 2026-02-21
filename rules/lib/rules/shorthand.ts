import { Match, Schema } from 'effect';
import { decodeUnknownSync } from 'effect/ParseResult';
import { Union } from 'effect/Schema';
import {
  RuleAction,
  RuleActionSchema,
  RuleOsArchSchema,
  RuleOsNameSchema,
  RuleSchema,
  type Rule,
} from './ruleset';

export const RulexSchema = Union(
  RuleSchema,
  Schema.transform(Union(Schema.String, RuleSchema), RuleSchema, {
    decode(rule): Rule {
      if (typeof rule !== 'string') {
        return rule;
      }

      if (rule === RuleAction.Allow || rule === RuleAction.Disallow) {
        return { action: rule };
      }

      const [encodedAction, type, key] = rule.split('.');

      const action = decodeUnknownSync(RuleActionSchema)(encodedAction);

      switch (type) {
        case 'os':
          if (!key) throw new Error('missing OS name');

          const [encodedName, version] = key.split('@');
          const name = decodeUnknownSync(RuleOsNameSchema)(encodedName);

          if (version) {
            return { action, os: { name, version } };
          }

          return { action, os: { name } };

        case 'features':
          if (!key) throw new Error('missing feature name');
          return { action, features: { [key]: true } };

        case 'arch':
          const arch = decodeUnknownSync(RuleOsArchSchema)(key);
          return { action, os: { arch } };

        default:
          throw new Error(`unknown type '${type}'`);
      }
    },

    encode(rule) {
      return Match.value(rule).pipe(
        Match.when(
          { os: { version: Match.any } },
          (rule) => `${rule.action}.os.${rule.os}@${rule.os.version}`,
        ),
        Match.when(
          { os: { name: Match.any } },
          (rule) => `${rule.action}.os.${rule.os.name}`,
        ),
        Match.when(
          { os: { arch: Match.any } },
          (rule) => `${rule.action}.arch.${rule.os.arch}`,
        ),
        Match.when({ features: Match.any }, (rule) => {
          if (Object.keys(rule.features).length !== 1) {
            return rule;
          }

          const [key] = Object.keys(rule.features);
          return `${rule.action}.features.${key}`;
        }),
        Match.when({ action: Match.any }, (rule) => rule.action),
        Match.orElse((rule) => rule),
      );
    },
  }),
);

export type Rulex = Schema.Schema.Type<typeof RulexSchema>;

export const RulexSetSchema = Union(
  Schema.Array(RulexSchema),
  Schema.transform(
    Union(RulexSchema, Schema.Array(RulexSchema)),
    Schema.Array(RulexSchema),
    {
      strict: true,
      decode: (rulexset) => [rulexset].flat(),
      encode: (rulexset) => [rulexset].flat() as Rulex[],
    },
  ),
);

export type RulexSet = Schema.Schema.Type<typeof RulexSetSchema>;
