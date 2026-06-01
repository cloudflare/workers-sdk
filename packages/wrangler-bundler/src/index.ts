/**
 * Public API for `@cloudflare/wrangler-bundler`.
 *
 * The primary entry point is the `cf-wrangler` delegate binary in
 * `bin/cf-wrangler`, which dispatches on a leading subcommand verb
 * (today: `dev`). Programmatic use is supported but is not the main
 * use case.
 */
export { runDev } from "./cli.js";
export type { DevArgs } from "./args.js";
