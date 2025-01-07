/**
 * Pages now supports configuration via a Wrangler configuration file. As opposed to
 * Workers however, Pages only supports a limited subset of all available
 * configuration keys.
 *
 * This file contains all Wrangler configuration file validation things, specific to
 * Pages.
 */
import { Diagnostics } from "./diagnostics";
import type { Config } from "./config";
export declare function validatePagesConfig(config: Config, envNames: string[], projectName?: string): Diagnostics;
