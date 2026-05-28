// Plugin factory.
export { minecraft } from './plugin';

// Canonical vanilla resolver + template type + helpers used by loaders.
export * from './template';

// Mappers — re-exported for forge-family loaders and advanced users.
export * from './mappers/libraries';
export * from './mappers/launch';
export * from './mappers/assets';
export * from './mappers/client';
