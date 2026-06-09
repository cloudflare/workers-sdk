#!/usr/bin/env node
// `cf-wrangler` delegate binary. Runs wrangler's bundled dev server
// in-process; the parent tool owns the Node runtime (version, flags).
//
// Dispatches on the leading verb. Only `dev` exists today; an unknown
// or missing verb exits 2, which the parent uses to feature-detect
// support.
const { runCfWranglerDev } = require("../wrangler-dist/cli.js");

const argv = process.argv.slice(2);
const verb = argv[0];

if (verb !== "dev") {
	process.stderr.write(
		`Error: unknown subcommand "${verb ?? ""}".\n` +
			`Usage: cf-wrangler dev [args]\n`
	);
	process.exit(2);
}

runCfWranglerDev(argv.slice(1)).then((code) => process.exit(code));
