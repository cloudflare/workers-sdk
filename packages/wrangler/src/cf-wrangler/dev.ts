/**
 * `dev` verb handler for the `cf-wrangler` delegate entrypoint.
 *
 * Builds options for wrangler's internal `startDev` — the same function
 * `wrangler dev` runs — and blocks until the dev session tears down.
 */
import events from "node:events";
import { startDev } from "../dev/start-dev";
import { run } from "../experimental-flags";
import { logger } from "../logger";
import { ArgParseError, parseArgs } from "./args";
import type { StartDevOptions } from "../dev";
import type { DevArgs } from "./args";

function buildStartDevOptions(parsed: DevArgs): StartDevOptions {
	// `StartDevOptions` is `wrangler dev`'s full (yargs-derived) options
	// object, so every field must be present. We set the four accepted
	// flags plus `wrangler dev`'s defaults and leave everything else
	// undefined, which makes wrangler's ConfigController resolve those
	// exactly as `wrangler dev` would (config discovery, containers,
	// inspector port, interactive hotkeys, ...). `--local` forces local
	// execution; left unset it preserves per-resource `remote = true`
	// bindings. There is no whole-worker remote dev (no `--remote`).
	return {
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
}

/**
 * Run the dev server until it tears down (a hotkey quit in a TTY, or a
 * signal from a non-interactive parent). Mirrors `wrangler dev`'s command
 * handler and installs no signal handlers of its own, so signal handling
 * and exit codes match `wrangler dev` exactly.
 *
 * @param argv argv after the `dev` verb (e.g. `["--port", "8788"]`).
 * @returns `0` on a clean teardown, `2` on an argv parse error.
 */
export async function runDev(argv: string[]): Promise<number> {
	let parsed: DevArgs;
	try {
		parsed = parseArgs(argv);
	} catch (err) {
		if (err instanceof ArgParseError) {
			logger.error(err.message);
			return 2;
		}
		throw err;
	}

	// `startDev` reads experimental flags from async-local storage. This
	// entrypoint is single-worker and never provisions resources.
	const devInstance = await run(
		{
			MULTIWORKER: false,
			RESOURCES_PROVISION: false,
			AUTOCREATE_RESOURCES: false,
		},
		() => startDev(buildStartDevOptions(parsed))
	);

	await events.once(devInstance.devEnv, "teardown");
	await Promise.all(devInstance.secondary.map((d) => d.teardown()));
	devInstance.unregisterHotKeys?.();

	return 0;
}
