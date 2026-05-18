import {
  OsNameSchema,
  OsArchSchema,
  type Rule,
  type Ruleset,
} from '@torba/mojang-rules';

type RawSingle = string | Rule;
type RawRuleset = RawSingle | RawSingle[];

function parseShortRule(raw: RawSingle): Rule {
  if (typeof raw !== 'string') return raw;

  const parts = raw.split('.');
  const action = parts[0] as 'allow' | 'disallow';
  if (action !== 'allow' && action !== 'disallow') {
    throw new Error(`Unknown action '${action}'`);
  }

  const type = parts[1];

  // bare "allow" / "disallow"
  if (!type) return { action };

  const rest = parts.slice(2).join('.');

  switch (type) {
    case 'os': {
      if (!rest) throw new Error('missing OS name');
      const atIdx = rest.indexOf('@');
      const namePart = atIdx === -1 ? rest : rest.slice(0, atIdx);
      const name = OsNameSchema.parse(namePart);
      const version = atIdx === -1 ? undefined : rest.slice(atIdx + 1);
      return version
        ? { action, os: { name, version } }
        : { action, os: { name } };
    }
    case 'features': {
      if (!rest) throw new Error('missing feature name');
      return { action, features: { [rest]: true } };
    }
    case 'arch': {
      if (!rest) throw new Error('missing arch');
      const arch = OsArchSchema.parse(rest);
      return { action, os: { arch } };
    }
    default:
      throw new Error(`unknown rule type '${type}'`);
  }
}

function encodeShortRule(rule: Rule): RawSingle {
  if ('os' in rule) {
    const os = rule.os;
    if ('name' in os && 'version' in os)
      return `${rule.action}.os.${os.name}@${os.version}`;
    if ('name' in os) return `${rule.action}.os.${os.name}`;
    return `${rule.action}.arch.${os.arch}`;
  }
  if ('features' in rule) {
    const keys = Object.keys(rule.features);
    if (keys.length === 1) return `${rule.action}.features.${keys[0]}`;
  }
  return rule.action;
}

function parseShortRuleset(raw: RawRuleset): Ruleset {
  const arr: RawSingle[] = Array.isArray(raw) ? raw : [raw];
  return arr.map(parseShortRule);
}

function encodeShortRuleset(ruleset: Ruleset): RawRuleset {
  const encoded = ruleset.map(encodeShortRule);
  if (encoded.length === 1) return encoded[0]!;
  return encoded;
}

export {
  parseShortRule,
  encodeShortRule,
  parseShortRuleset,
  encodeShortRuleset,
};
