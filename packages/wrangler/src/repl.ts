import { logger } from "./logger";

export async function repl() {
	// Dynamically imported for speed
	const { Miniflare } = await import("miniflare");

	logger.log("Interactive REPL session started though Miniflare");
	const mf = new Miniflare({
		// Allow REPL to be started without a script
		scriptRequired: false,
		// Disable file watching in REPL
		watch: false,
		// Allow async I/O in REPL without request context
		globalAsyncIO: true,
		globalTimers: true,
		globalRandom: true,
	});

	await mf.startREPL();
}
