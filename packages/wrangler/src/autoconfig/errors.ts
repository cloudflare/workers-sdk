import { UserError } from "@cloudflare/workers-utils";

/**
 * Base class for errors where something in a autoconfig frameworks' configuration goes
 * something wrong. These are not reported to Sentry.
 */
export class AutoConfigFrameworkConfigurationError extends UserError {}
