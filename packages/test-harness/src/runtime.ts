import * as fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readBuildOutput } from "@cloudflare/build-output-utils";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import { loadDevVars, loadEnv } from "@cloudflare/workers-utils/local-env";
import { resolveLocalBindings } from "miniflare";
import { getRemoteBindingsAuth } from "./auth";
import type { TestHarnessOptions, WorkerInput } from "./index";
import type { BuildOutputWorker } from "@cloudflare/build-output-utils";
import type {
	RemoteBindingsLogger,
	RemoteProxySessionData,
} from "@cloudflare/remote-bindings";
import type { WorkerOptions } from "miniflare";

type Manifest = NonNullable<WorkerOptions["config"]["manifest"]>;
type Exports = NonNullable<WorkerOptions["config"]["exports"]>;

const remoteBindingsLogger: RemoteBindingsLogger = {
	loggerLevel: "log",
	// Look up console methods when called, so console spies see them
	debug: (...args) => console.debug(...args),
	log: (...args) => console.log(...args),
	info: (...args) => console.info(...args),
	warn: (...args) => console.warn(...args),
	error: (...args) => console.error(...args),
	console(method, ...args) {
		Reflect.apply(console[method], console, args);
	},
};

/** A Worker from a project's Build Output, resolved for Miniflare */
export type ResolvedWorker = {
	/** The Worker's Miniflare options */
	options: WorkerOptions;
	/** The Worker's remote bindings session, if it has remote bindings */
	remoteProxySessionData: RemoteProxySessionData | null;
};

/**
 * Resolves Workers from their projects' Build Output, as `vite preview` runs
 * a build.
 *
 * @param options The Workers to run, primary Worker first, and the directory
 * that relative `buildOutput` paths resolve from
 * @returns The resolved Workers
 */
export async function resolveWorkerInputs({
	root = process.cwd(),
	workers: inputs,
}: TestHarnessOptions): Promise<ResolvedWorker[]> {
	if (inputs.length === 0) {
		throw new Error("Test harness requires at least one worker.");
	}

	const workers: ResolvedWorker[] = [];
	try {
		// One at a time, so a failure leaves no remote session still starting
		for (const input of inputs) {
			workers.push(await resolveWorker(toPath(root), input));
		}
		return workers;
	} catch (error) {
		await disposeRemoteProxySessions(workers);
		throw error;
	}
}

/**
 * Disposes the remote bindings sessions of resolved Workers.
 *
 * @param workers The resolved Workers
 */
export async function disposeRemoteProxySessions(
	workers: ResolvedWorker[]
): Promise<void> {
	await Promise.all(
		workers.map(({ remoteProxySessionData }) =>
			remoteProxySessionData?.session.dispose()
		)
	);
}

/**
 * Resolves one Worker in a project's Build Output for Miniflare.
 *
 * @param root The directory that a relative `buildOutput` path resolves from
 * @param input The Worker to run, and its test values
 * @returns The Worker's Miniflare options and remote bindings session
 */
async function resolveWorker(
	root: string,
	input: WorkerInput
): Promise<ResolvedWorker> {
	const projectDir = path.resolve(root, toPath(input.buildOutput));
	const buildOutput = await readBuildOutput(projectDir);
	const builtWorkers = Object.values(buildOutput.workers);
	const worker =
		input.name === undefined
			? buildOutput.workers.default
			: builtWorkers.find(({ config }) => config.name === input.name);
	if (worker === undefined) {
		throw new Error(
			`No Worker named "${input.name}" in the Build Output at ${projectDir}. It has: ${builtWorkers.map(({ config }) => config.name).join(", ")}.`
		);
	}

	const { rootConfig } = buildOutput;
	// Secrets come from the files for the build's mode, as in `vite preview`
	const mode = rootConfig.buildContext.mode ?? "production";
	const [localEnv, devVars] = await Promise.all([
		loadEnv(projectDir, mode),
		loadDevVars(projectDir, mode),
	]);
	const {
		manifest: _manifest,
		assets,
		env: configuredEnv,
		exports: _exports,
		...config
	} = worker.config;
	// Test values replace configured bindings before anything uses them, so an
	// overridden remote binding doesn't start a remote session
	const testEnv = { ...configuredEnv };
	for (const [name, value] of Object.entries(input.vars ?? {})) {
		testEnv[name] =
			typeof value === "string"
				? { type: "text", value }
				: { type: "json", value };
	}
	for (const [name, value] of Object.entries(input.secrets ?? {})) {
		testEnv[name] = { type: "text", value };
	}
	for (const [name, workerName] of Object.entries(
		input.bindingOverrides ?? {}
	)) {
		testEnv[name] = { type: "worker", worker: workerName };
	}
	const env = resolveLocalBindings(testEnv, {
		workerName: config.name,
		localEnv: localEnv.values,
		devVars,
		mode,
		logger: console,
	});
	// Before starting a remote session, so a failure here can't leave it running
	const exports = getExports(worker);
	const manifest = await getManifest(worker);

	const session = await maybeStartOrUpdateRemoteProxySession(
		{
			name: config.name,
			target: "cf",
			env: testEnv,
			complianceRegion:
				rootConfig.complianceRegion === "fedramp-high"
					? "fedramp_high"
					: rootConfig.complianceRegion,
			account_id: rootConfig.accountId,
			profileDir: projectDir,
		},
		null,
		getRemoteBindingsAuth(
			projectDir,
			rootConfig.accountId,
			remoteBindingsLogger
		),
		{ cliDisplayName: "cf", logger: remoteBindingsLogger }
	);

	return {
		options: {
			config: {
				...config,
				env,
				exports,
				manifest,
				assets: worker.assetsDir
					? {
							...assets,
							directory: worker.assetsDir,
							hasUserWorker: worker.bundleDir !== undefined,
						}
					: undefined,
			},
			dev: {
				remoteProxyConnectionString:
					session?.session.remoteProxyConnectionString,
			},
		},
		remoteProxySessionData: session,
	};
}

/**
 * Reads a Worker's modules from its Build Output bundle.
 *
 * @param worker The Worker in the Build Output
 * @returns The Worker's module manifest
 */
async function getManifest(worker: BuildOutputWorker): Promise<Manifest> {
	const { manifest } = worker.config;
	if (manifest === undefined || worker.bundleDir === undefined) {
		// An assets-only Worker has no code of its own
		return {
			mainModule: "index.mjs",
			modules: {
				"index.mjs": { type: "esm", contents: "export default {};" },
			},
		};
	}

	const { bundleDir } = worker;
	const modules: Manifest["modules"] = {};
	await Promise.all(
		Object.entries(manifest.modules).map(async ([modulePath, { type }]) => {
			const contents = await fsp.readFile(path.join(bundleDir, modulePath));
			modules[modulePath] = {
				type,
				contents:
					type === "wasm" || type === "data"
						? new Uint8Array(contents)
						: contents.toString(),
			};
		})
	);
	return { mainModule: manifest.mainModule, modulesRoot: bundleDir, modules };
}

/**
 * Takes a Worker's exports from its Build Output.
 *
 * @param worker The Worker in the Build Output
 * @returns The Worker's exports
 */
function getExports(worker: BuildOutputWorker): Exports {
	const exports: Exports = {};
	for (const [name, workerExport] of Object.entries(
		worker.config.exports ?? {}
	)) {
		if ("container" in workerExport && workerExport.container !== undefined) {
			throw new Error(
				`The test harness doesn't support Containers yet, which the "${name}" export of Worker "${worker.config.name}" uses.`
			);
		}
		// Without a Container, an export has the same shape in both
		exports[name] = workerExport as Exports[string];
	}
	return exports;
}

/**
 * @param value A path, or a `file:` URL
 * @returns The path
 */
function toPath(value: string | URL): string {
	return value instanceof URL ? fileURLToPath(value) : value;
}
