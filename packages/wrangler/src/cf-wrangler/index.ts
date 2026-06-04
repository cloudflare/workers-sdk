/**
 * `cf-wrangler` delegate entrypoint — an escape hatch for projects that
 * can't use `@cloudflare/vite-plugin`. Ships inside `wrangler` (reached
 * via the `cf-wrangler` bin) so it can drive the internal `startDev`
 * directly. Spawned by a parent "cf" CLI, not run directly by users.
 */
import { runDev } from "./dev";

/**
 * Dispatch on the leading verb. Only `dev` exists today; an unknown or
 * missing verb exits 2, which the parent uses to feature-detect support.
 */
export async function runCfWrangler(argv: string[]): Promise<number> {
	const verb = argv[0];
	if (verb !== "dev") {
		process.stderr.write(
			`Error: unknown subcommand "${verb ?? ""}".\n` +
				`Usage: cf-wrangler dev [args]\n`
		);
		return 2;
	}
	return runDev(argv.slice(1));
}
