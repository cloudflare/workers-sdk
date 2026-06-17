#!/usr/bin/env node
// `cf-wrangler` delegate binary. Runs wrangler's bundled dev server
// in-process; the parent tool owns the Node runtime (version, flags).
//
// Dispatches on the leading verb. Only `dev` exists today; an unknown
// or missing verb exits 2, which the parent uses to feature-detect
// support.
const {
	ArgParseError,
	parseCfWranglerArgs,
	runCfWranglerDev,
} = require("../wrangler-dist/cli.js");

const argv = process.argv.slice(2);
const verb = argv[0];

if (verb !== "dev") {
	process.stderr.write(
		`Error: unknown subcommand "${verb ?? ""}".\n` +
			`Usage: cf-wrangler dev [args]\n`
	);
	process.exit(2);
}

let parsed;
try {
	parsed = parseCfWranglerArgs(argv.slice(1));
} catch (err) {
	if (err instanceof ArgParseError) {
		process.stderr.write(`Error: ${err.message}\n`);
		process.exit(2);
	}
	throw err;
}

// Build wrangler dev's full (yargs-derived) options object. Every field
// must be present; we set the four accepted flags plus `wrangler dev`'s
// defaults and leave everything else `undefined`, which makes wrangler's
// ConfigController resolve those exactly as `wrangler dev` would (config
// discovery, containers, inspector port, interactive hotkeys, ...).
// `--local` forces local execution; left unset it preserves per-resource
// `remote = true` bindings. There is no whole-worker remote dev (no
// `--remote`).
const options = {
	_: [],
	$0: "",
	env: parsed.mode,
	port: parsed.port,
	host: parsed.host,
	local: parsed.local,
	remote: false,
	latest: true,
	noBundle: false,
	testScheduled: false,
	processEntrypoint: false,
	experimentalAutoCreate: false,
	types: false,
	disableDevRegistry: false,
	config: undefined,
	script: undefined,
	name: undefined,
	accountId: undefined,
	forceLocal: undefined,
	compatibilityDate: undefined,
	compatibilityFlags: undefined,
	ip: undefined,
	inspectorPort: undefined,
	inspectorIp: undefined,
	v: undefined,
	cwd: undefined,
	localProtocol: undefined,
	httpsKeyPath: undefined,
	httpsCertPath: undefined,
	assets: undefined,
	site: undefined,
	siteInclude: undefined,
	siteExclude: undefined,
	persist: undefined,
	persistTo: undefined,
	routes: undefined,
	localUpstream: undefined,
	upstreamProtocol: undefined,
	var: undefined,
	define: undefined,
	alias: undefined,
	jsxFactory: undefined,
	jsxFragment: undefined,
	tsconfig: undefined,
	minify: undefined,
	legacyEnv: undefined,
	logLevel: undefined,
	showInteractiveDevSession: undefined,
	liveReload: undefined,
	bundle: undefined,
	additionalModules: undefined,
	enablePagesAssetsServiceBinding: undefined,
	d1Databases: undefined,
	experimentalProvision: undefined,
	enableIpc: undefined,
	nodeCompat: undefined,
	enableContainers: undefined,
	dockerPath: undefined,
	containerEngine: undefined,
	tunnel: undefined,
	tunnelName: undefined,
	envFile: undefined,
	onReady: undefined,
};

runCfWranglerDev(options)
	.then((code) => process.exit(code))
	.catch((err) => {
		process.stderr.write(`${(err && err.stack) || err}\n`);
		process.exit(1);
	});
