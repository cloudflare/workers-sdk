import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { readBuildOutput } from "@cloudflare/build-output-utils";
import { removeDir } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import type { BuildOutputWorker } from "@cloudflare/build-output-utils";
import type {
	PlatformProxyConnection,
	WorkerdStructuredLog,
	WorkerOptions,
} from "miniflare";

type MiniflareConfig = WorkerOptions["config"];
type MiniflareEnv = NonNullable<MiniflareConfig["env"]>;
type MiniflareExports = NonNullable<MiniflareConfig["exports"]>;
type MiniflareManifest = NonNullable<MiniflareConfig["manifest"]>;

export type PreviewServerOptions = {
	/** Project root containing `.cloudflare/output/v0`. Defaults to `process.cwd()`. */
	root?: string;
	/** Local values for `secret` bindings, keyed by Worker name. */
	secrets?: Record<string, Record<string, string>>;
	/** Port to listen on. Defaults to a random free port. */
	port?: number;
};

export type PreviewServer = {
	/** URL of the entry Worker. Also serves the Local Explorer API. */
	url: URL;
	/** Worker names. The first is the entry Worker. */
	workers: string[];
	/** Structured logs captured since start. */
	logs: WorkerdStructuredLog[];
	/**
	 * Connection details for `connectBindings()`, from this or another process.
	 * Contains the platform proxy secret.
	 */
	getBindingsConnection(workerName?: string): Promise<PlatformProxyConnection>;
	dispose(): Promise<void>;
};

/**
 * Starts a local preview of a Build Output Specification tree. A thin wrapper
 * over Miniflare: it only exposes the options above, and keeps Miniflare
 * itself out of the public API.
 *
 * @param options - Where to read the build output from and how to serve it.
 * @returns The running server.
 */
export async function createPreviewServer(
	options: PreviewServerOptions = {}
): Promise<PreviewServer> {
	const root = path.resolve(options.root ?? process.cwd());
	const { workers: outputWorkers } = await readBuildOutput(root);
	const { default: entryWorker, ...auxiliaryWorkers } = outputWorkers;
	const workers = await Promise.all(
		[entryWorker, ...Object.values(auxiliaryWorkers)].map((worker) =>
			toWorkerOptions(worker, root, options.secrets?.[worker.config.name])
		)
	);
	const logs: WorkerdStructuredLog[] = [];

	// The Explorer's `/local/workers` only lists Workers found in a dev
	// registry. A private one makes them visible without joining (and
	// aggregating with) the user's other dev sessions. A Miniflare fix would
	// remove this workaround.
	const registryDir = await fsp.mkdtemp(path.join(os.tmpdir(), "mf-registry-"));
	const miniflare = new Miniflare({
		host: "127.0.0.1",
		port: options.port ?? 0,
		unsafeDevRegistryPath: registryDir,
		unsafeLocalExplorer: true,
		unsafeTriggerHandlers: true,
		unsafeInspectDurableObjects: true,
		telemetry: { enabled: false },
		handleStructuredLogs: (log) => logs.push(log),
		workers,
	});
	const url = await miniflare.ready.catch(async (error: unknown) => {
		await miniflare.dispose().catch(() => {});
		await removeDir(registryDir);
		throw error;
	});

	return {
		url,
		workers: workers.map((worker) => worker.config.name),
		logs,
		getBindingsConnection: (workerName) =>
			miniflare.unsafeGetPlatformProxyConnection(workerName),
		async dispose() {
			await miniflare.dispose();
			await removeDir(registryDir);
		},
	};
}

/**
 * Maps one build output Worker onto Miniflare's native Worker config, which
 * already extends the build output's `worker.config.json` schema.
 */
async function toWorkerOptions(
	worker: BuildOutputWorker,
	root: string,
	secrets: Record<string, string> = {}
): Promise<WorkerOptions> {
	const { manifest, assets, env, exports, ...config } = worker.config;

	return {
		config: {
			...config,
			env: toMiniflareEnv(env, secrets),
			exports: toMiniflareExports(exports),
			manifest:
				manifest && worker.bundleDir
					? await readManifest(worker.bundleDir, manifest)
					: assetsOnlyManifest(root),
			assets: worker.assetsDir
				? {
						...assets,
						directory: worker.assetsDir,
						hasUserWorker: worker.bundleDir !== undefined,
					}
				: undefined,
		},
		dev: { rootPath: root },
	};
}

function toMiniflareEnv(
	env: BuildOutputWorker["config"]["env"],
	secrets: Record<string, string>
): MiniflareEnv {
	const result: MiniflareEnv = {};
	for (const [name, binding] of Object.entries(env ?? {})) {
		if (binding.type === "secret") {
			if (secrets[name] !== undefined) {
				result[name] = { type: "text", value: secrets[name] };
			}
		} else if (binding.type === "hyperdrive") {
			const dev = binding.dev;
			if (dev?.connectionString === undefined) {
				throw new Error(
					`Hyperdrive binding "${name}" needs dev.connectionString (not yet supported otherwise).`
				);
			}
			result[name] = { ...binding, dev };
		} else {
			result[name] = binding;
		}
	}
	return result;
}

function toMiniflareExports(
	exports: BuildOutputWorker["config"]["exports"]
): MiniflareExports {
	const result: MiniflareExports = {};
	for (const [name, workerExport] of Object.entries(exports ?? {})) {
		// Same shape as the Vite plugin's `createMiniflareExports()`, minus
		// Container support.
		if (workerExport.type === "durable-object" && "storage" in workerExport) {
			if ("container" in workerExport && workerExport.container !== undefined) {
				throw new Error(
					`Container-backed Durable Object "${name}" is not yet supported.`
				);
			}
			result[name] = { ...workerExport, container: undefined };
		} else {
			result[name] = workerExport;
		}
	}
	return result;
}

async function readManifest(
	bundleDir: string,
	manifest: NonNullable<BuildOutputWorker["config"]["manifest"]>
): Promise<MiniflareManifest> {
	const modules: MiniflareManifest["modules"] = {};
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

function assetsOnlyManifest(root: string): MiniflareManifest {
	return {
		mainModule: "__assets_only__.js",
		modulesRoot: root,
		modules: {
			"__assets_only__.js": { type: "esm", contents: "export default {};" },
		},
	};
}
