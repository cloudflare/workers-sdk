/**
 * A symbol to inherit a binding from the deployed worker.
 */
export const INHERIT_SYMBOL = Symbol.for("inherit_binding");

export const SERVICE_TAG_PREFIX = "cf:service=";
export const ENVIRONMENT_TAG_PREFIX = "cf:environment=";

export const PATH_TO_DEPLOY_CONFIG = ".wrangler/deploy/config.json";

/**
 * Config formats that use JSON parsing
 */
export const JSON_CONFIG_FORMATS: readonly string[] = ["json", "jsonc"];
