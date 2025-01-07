import type { RawConfig } from "./config";
export declare const experimental_patchConfig: (configPath: string, patch: RawConfig, isArrayInsertion?: boolean) => string;
/**
 * Custom error class for config patching errors
 */
export declare class PatchConfigError extends Error {
}
