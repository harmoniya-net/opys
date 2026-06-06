export const FORGE_WRAPPER_MAIN =
  'io.github.zekerzhayard.forgewrapper.installer.Main';

export interface ForgeWrapperOptions {
  /** Download URL for the ForgeWrapper JAR. */
  url?: string;
  /** Optional sha1 for integrity verification. */
  sha1?: string;
  /** Optional declared size in bytes. */
  size?: number;
  /** Override the destination path under `${library_directory}`. */
  path?: string;
}
