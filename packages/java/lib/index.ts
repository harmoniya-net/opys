export { java } from './plugin';
export {
  resolveJava,
  type JavaOptions,
  type JavaVendor,
  type JavaTemplate,
} from './template';
export {
  DEFAULT_PLATFORMS,
  type Platform,
  type SupportedArch,
} from './platforms';
export { resolveTemurin, type ResolveTemurinOptions } from './temurin';
export { resolveZulu, type ResolveZuluOptions } from './zulu';
export { resolveGraalvm, type ResolveGraalvmOptions } from './graalvm';
export type { VendorRelease, VendorBinary } from './vendor';
