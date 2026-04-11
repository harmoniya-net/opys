import { z } from 'zod';
import { RuleAction, RuleActionSchema, RuleSchema, Rule } from './rule';
import { RuleOsArchSchema, RuleOsNameSchema, RuleOs } from './os';
import { Ruleset } from './ruleset';
import { FeatureMap } from './features';

type RawRule = z.infer<typeof RuleSchema>;
type RawSingleInput = string | RawRule;
type RawRulesetInput = RawSingleInput | RawSingleInput[];

function decodeRule(raw: RawSingleInput): Rule {
  if (raw instanceof Rule) return raw as unknown as Rule;

  if (typeof raw !== 'string') {
    // When called from ShortRuleset's decode, items are already parsed through
    // SingleRuleInput so `os`/`features` are already decoded instances — construct
    // Rule directly to avoid re-running the codec and losing those instances.
    return new Rule(raw as z.infer<typeof RuleSchema>);
  }

  if (raw === RuleAction.Allow || raw === RuleAction.Disallow) {
    return new Rule({ action: raw as RuleAction });
  }

  const parts = raw.split('.');
  const encodedAction = parts[0] ?? '';
  const type = parts[1];
  const rest = parts.slice(2);

  const action = RuleActionSchema.parse(encodedAction) as RuleAction;
  const key = rest.join('.');

  switch (type) {
    case 'os': {
      if (!key) throw new Error('missing OS name');
      const atIdx = key.indexOf('@');
      const encodedName = atIdx === -1 ? key : key.slice(0, atIdx);
      const version = atIdx === -1 ? undefined : key.slice(atIdx + 1);
      const name = RuleOsNameSchema.parse(encodedName);
      return new Rule({
        action,
        os: RuleOs.CODEC.decode(version ? { name, version } : { name }),
      });
    }
    case 'features': {
      if (!key) throw new Error('missing feature name');
      return new Rule({
        action,
        features: FeatureMap.CODEC.decode({ [key]: true }),
      });
    }
    case 'arch': {
      if (!key) throw new Error('missing arch');
      const arch = RuleOsArchSchema.parse(key);
      return new Rule({ action, os: RuleOs.CODEC.decode({ arch }) });
    }
    default:
      throw new Error(`unknown rule type '${type}'`);
  }
}

function encodeRule(rule: Rule): RawSingleInput {
  const raw = rule.toJSON();
  const action = raw.action;

  if ('os' in raw) {
    const os = raw.os.toJSON();
    if ('name' in os && 'version' in os)
      return `${action}.os.${os.name}@${os.version}`;
    if ('name' in os) return `${action}.os.${os.name}`;
    if ('arch' in os) return `${action}.arch.${os.arch}`;
  }

  if ('features' in raw) {
    const features = raw.features.toJSON();
    const keys = Object.keys(features);
    if (keys.length === 1) return `${action}.features.${keys[0]}`;
  }

  return action;
}

const SingleRuleInput = z.union([z.string(), RuleSchema]);

/** Codec for a single shorthand rule: `"allow.os.linux"`, `"disallow"`, or a full rule object. */
export const ShortRule = z.codec(SingleRuleInput, z.instanceof(Rule), {
  decode: (val) => decodeRule(val),
  encode: (rule): RawSingleInput => encodeRule(rule),
});

/** @deprecated Use {@link ShortRule} */
export const InlineRuleSchema = ShortRule;

export type ShortRuleInput = z.input<typeof ShortRule>;

const InlineRulesetInput = z.union([
  z.string(),
  RuleSchema,
  z.array(SingleRuleInput),
]);

/** Codec for a ruleset expressed as one or many shorthand rules. Used for the `rules` field in unifacts. */
export const ShortRuleset = z.codec(InlineRulesetInput, z.instanceof(Ruleset), {
  decode: (val): Ruleset => {
    const arr: RawSingleInput[] = Array.isArray(val)
      ? val
      : [val as RawSingleInput];
    return new Ruleset(arr.map((item) => decodeRule(item)));
  },
  encode: (ruleset): RawRulesetInput => {
    const rules = [...ruleset];
    const encoded = rules.map(encodeRule);
    if (encoded.length === 1) return encoded[0]!;
    return encoded;
  },
});

/** @deprecated Use {@link ShortRuleset} */
export const InlineRulesetSchema = ShortRuleset;
