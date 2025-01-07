import { Diagnostics } from "./diagnostics";
import type { Config, RawConfig } from "./config";
export type NormalizeAndValidateConfigArgs = {
    name?: string;
    env?: string;
    "legacy-env"?: boolean;
    "dispatch-namespace"?: string;
    remote?: boolean;
    localProtocol?: string;
    upstreamProtocol?: string;
};
export declare function isPagesConfig(rawConfig: RawConfig): boolean;
/**
 * Validate the given `rawConfig` object that was loaded from `configPath`.
 *
 * The configuration is normalized, which includes using default values for missing field,
 * and copying over inheritable fields into named environments.
 *
 * Any errors or warnings from the validation are available in the returned `diagnostics` object.
 */
export declare function normalizeAndValidateConfig(rawConfig: RawConfig, configPath: string | undefined, args: NormalizeAndValidateConfigArgs): {
    config: Config;
    diagnostics: Diagnostics;
};
