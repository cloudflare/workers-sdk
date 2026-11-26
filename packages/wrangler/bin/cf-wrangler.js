#!/usr/bin/env node
// `cf-wrangler` delegate binary. Runs wrangler delegate verbs in-process;
// the parent tool owns the Node runtime (version, flags).
//
// Dispatches on the leading verb. An unknown or missing verb exits 2, which
// the parent uses to feature-detect support.
const {
	ArgParseError,
	parseCfWranglerBuildArgs,
	parseCfWranglerArgs,
	runCfWranglerBuild,
	runCfWranglerDev,
} = require("../wrangler-dist/cli.js");

const argv = process.argv.slice(2);
const verb = argv[0];

const verbHandlers = {
	dev: {
		parse: parseCfWranglerArgs,
		run: runCfWranglerDev,
	},
	build: {
		parse: parseCfWranglerBuildArgs,
		run: runCfWranglerBuild,
	},
};

const verbHandler = verbHandlers[verb];

if (!verbHandler) {
	process.stderr.write(
		`Error: unknown subcommand "${verb ?? ""}".\n` +
			`Usage: cf-wrangler <${Object.keys(verbHandlers).join("|")}> [args]\n`
	);
	process.exit(2);
}

let parsed;
try {
	parsed = verbHandler.parse(argv.slice(1));
} catch (err) {
	if (err instanceof ArgParseError) {
		process.stderr.write(`Error: ${err.message}\n`);
		process.exit(2);
	}
	throw err;
}

verbHandler
	.run(parsed)
	.then((code) => process.exit(code))
	.catch((err) => {
		process.stderr.write(`${(err && err.stack) || err}\n`);
		process.exit(1);
	});
