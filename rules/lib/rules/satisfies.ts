import { Match } from 'effect';
import {
  RuleAction,
  type FeatureMap,
  type RuleOs,
  type RuleSet,
} from './ruleset';

export type SatisfiesOsOptions = {
  name: string;
  version: string;
  arch: string;
};

export function satisfies(
  rules: RuleSet,
  options: SatisfiesOsOptions,
  feats: string[] = [],
): boolean {
  return [rules].flat().every((rule) =>
    Match.value(rule).pipe(
      Match.when(
        { os: Match.any },
        ({ os, action }) => isOs(os, options) === isAllow(action),
      ),
      Match.when({ features: Match.any }, ({ features, action }) => {
        return isFeatures(features, feats) === isAllow(action);
      }),
      Match.orElse(({ action }) => isAllow(action)),
    ),
  );
}

function isAllow(action: RuleAction) {
  return action === RuleAction.Allow;
}

function isOs(os: RuleOs, options: SatisfiesOsOptions) {
  return Match.value(os).pipe(
    Match.when(
      { name: Match.any, version: Match.any },
      ({ name, version }) =>
        name === options.name && isVersion(version, options),
    ),
    Match.when({ name: Match.any }, ({ name }) => name === options.name),
    Match.when({ arch: Match.any }, ({ arch }) => arch === options.arch),
    Match.exhaustive,
  );
}

function isVersion(version: string, options: SatisfiesOsOptions) {
  return new RegExp(version).test(options.version);
}

function isFeatures(features: FeatureMap, feats: string[]) {
  return Object.entries(features).every(([feature, should]) => {
    return feats.some((feat) => feat === feature) === should;
  });
}
