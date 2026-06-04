#!/usr/bin/env node
// `cf-wrangler` delegate binary. Runs wrangler's bundled dev server
// in-process; the parent tool owns the Node runtime (version, flags).
const { runCfWrangler } = require("../wrangler-dist/cli.js");

runCfWrangler(process.argv.slice(2)).then((code) => process.exit(code));
