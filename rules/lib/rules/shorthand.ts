// import { z } from 'zod';
// import { RuleAction, RuleActionSchema, RuleSchema, Rule } from './rule';
// import { RuleOsArchSchema, RuleOsNameSchema, RuleOs } from './os';
// import { Ruleset } from './ruleset';
// import { FeatureMap } from './features';

// export const InlineRuleSchema = z.codec(z.any(), z.any(), {
//   decode(rule: any): Rule {
//     if (typeof rule !== 'string') {
//       if (rule instanceof Rule) return rule;
//       if (rule.os && !(rule.os instanceof RuleOs)) {
//         rule.os = RuleOs.CODEC.decode(rule.os);
//       }
//       if (rule.features && !(rule.features instanceof FeatureMap)) {
//         rule.features = FeatureMap.CODEC.decode(rule.features);
//       }
//       return new Rule(rule);
//     }

//     if (rule === RuleAction.Allow || rule === RuleAction.Disallow) {
//       return new Rule({ action: rule });
//     }

//     const [encodedAction, type, ...rest] = rule.split('.');
//     const action = RuleActionSchema.parse(encodedAction || '');
//     const key = rest.join('.');

//     switch (type) {
//       case 'os': {
//         if (!key) throw new Error('missing OS name');
//         const [encodedName, version] = key.split('@');

//         const name = RuleOsNameSchema.parse(encodedName);
//         return new Rule({
//           action,
//           os: RuleOs.CODEC.decode(version ? { name, version } : { name }),
//         });
//       }
//       case 'features': {
//         if (!key) throw new Error('missing feature name');
//         return new Rule({
//           action,
//           features: FeatureMap.CODEC.decode({ [key]: true }),
//         });
//       }
//       case 'arch': {
//         const arch = RuleOsArchSchema.parse(key);
//         return new Rule({ action, os: RuleOs.CODEC.decode({ arch }) });
//       }
//       default:
//         throw new Error(`unknown type '${type}'`);
//     }
//   },
//
//   encode(rule: any): string | any {
//     if (typeof rule === 'string') return rule;
//     const raw = rule instanceof Rule ? rule.toJSON() : rule;
//     if (!raw) return 'allow';

//     const action = raw.action || 'allow';

//     if (raw.os) {
//       const os = raw.os instanceof RuleOs ? raw.os.toJSON() : raw.os;
//       if (os.name && os.version) return `${action}.os.${os.name}@${os.version}`;
//       if (os.name) return `${action}.os.${os.name}`;
//       if (os.arch) return `${action}.arch.${os.arch}`;
//     }

//     if (raw.features) {
//       const features =
//         raw.features instanceof FeatureMap
//           ? raw.features.toJSON()
//           : raw.features;
//       const keys = Object.keys(features);
//       if (keys.length === 1) return `${action}.features.${keys[0]}`;
//     }

//     return action;
//   },
// });

// export const InlineRulesetSchema = z.codec(z.any(), z.any(), {
//   decode: (val) => {
//     const arr = Array.isArray(val) ? val : [val].filter((v) => v != null);
//     return new Ruleset(arr.map((item) => InlineRuleSchema.decode(item)));
//   },
//   encode: (val) => {
//     const arr = Array.isArray(val) ? val : [...val];
//     const encoded = arr.map((item) => InlineRuleSchema.encode(item));
//     if (encoded.length === 0) return [];
//     return encoded.length === 1 ? encoded[0] : encoded;
//   },
// });
