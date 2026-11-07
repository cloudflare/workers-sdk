import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { Worker } from "node:worker_threads";
import getPort from "get-port";
import type { Log } from "../../shared";
import type { GitSidecar } from "./git-sidecar";

export interface LocalArtifactsBackend {
	sidecar: GitSidecar;
	port: number;
}

export interface LocalArtifactsBackendOptions {
	namespace?: string;
	portFile?: string;
}

// Node binding proxies make synchronous calls. The Git backend must run on
// another thread, otherwise those calls prevent it from answering workerd.
export class ArtifactsController {
	#backends = new Map<string, Promise<LocalArtifactsBackend>>();
	// Keep the old roots alive until workerd accepts the replacement config.
	#activeRoots = new Set<string>();
	#pendingRoots?: Set<string>;

	constructor(private readonly getLog?: () => Pick<Log, "info" | "warn">) {}

	beginUpdate(): void {
		if (this.#pendingRoots) {
			throw new Error("Artifacts runtime update already in progress");
		}
		this.#pendingRoots = new Set();
	}

	async commitUpdate(): Promise<void> {
		const roots = this.#pendingRoots;
		if (!roots) {
			throw new Error("No Artifacts runtime update to commit");
		}
		this.#pendingRoots = undefined;
		this.#activeRoots = roots;
		await this.#closeExcept(roots);
	}

	async abortUpdate(): Promise<void> {
		if (!this.#pendingRoots) {
			return;
		}
		this.#pendingRoots = undefined;
		await this.#closeExcept(this.#activeRoots);
	}

	/**
	 * @param root Git storage directory for one namespace.
	 * @param options.namespace Prints the namespace's Git remote prefix.
	 * @param options.portFile Reuses the Git port recorded here, if it's free.
	 */
	get(
		root: string,
		options: LocalArtifactsBackendOptions = {}
	): Promise<LocalArtifactsBackend> {
		root = path.resolve(root);
		if (!this.#pendingRoots) {
			throw new Error("Artifacts backend requested outside runtime update");
		}
		this.#pendingRoots.add(root);
		let backend = this.#backends.get(root);
		if (!backend) {
			backend = this.#start(root, options, () => {
				if (this.#backends.get(root) === backend) {
					this.#backends.delete(root);
				}
			});
			this.#backends.set(root, backend);
			void backend.catch(() => {
				if (this.#backends.get(root) === backend) {
					this.#backends.delete(root);
				}
			});
		}
		return backend;
	}

	async #start(
		root: string,
		{ namespace, portFile }: LocalArtifactsBackendOptions,
		onExit: () => void
	): Promise<LocalArtifactsBackend> {
		const port = await reserveGitPort(portFile);
		if (namespace !== undefined) {
			this.getLog?.().info(
				`Local Artifacts Git remotes for namespace "${namespace}": http://127.0.0.1:${port}/git/${namespace}/<repo>.git`
			);
		}
		// __dirname is dist/src in the bundled Miniflare entry point.
		const worker = new Worker(
			path.join(__dirname, "plugins/artifacts/git-sidecar.js"),
			{ workerData: { root } }
		);
		try {
			const endpoint = await waitForSidecarReady(worker);
			let stopping = false;
			worker.on("error", () => {
				this.getLog?.().warn("Local Artifacts Git backend failed");
			});
			worker.once("exit", (code) => {
				onExit();
				if (!stopping) {
					this.getLog?.().warn(
						`Local Artifacts Git backend exited (${code}). Restart the dev server or reload its configuration to reconnect.`
					);
				}
			});
			return {
				port,
				sidecar: {
					...endpoint,
					async close() {
						if (worker.threadId === -1) {
							return;
						}
						stopping = true;
						// `events.once()` rejects on a preceding error, even if the thread exits.
						const exited = new Promise<void>((resolve) => {
							const done = () => {
								worker.off("exit", done);
								worker.off("error", done);
								resolve();
							};
							worker.once("exit", done);
							worker.once("error", done);
						});
						worker.postMessage("close");
						await exited;
					},
				},
			};
		} catch (error) {
			await worker.terminate();
			throw error;
		}
	}

	async #closeExcept(roots: Set<string>): Promise<void> {
		const retired = [...this.#backends].filter(([root]) => !roots.has(root));
		for (const [root] of retired) {
			this.#backends.delete(root);
		}
		const results = await Promise.allSettled(
			retired.map(([, backend]) =>
				backend.then(
					({ sidecar }) => sidecar.close(),
					() => undefined
				)
			)
		);
		for (const result of results) {
			if (result.status === "rejected") {
				this.getLog?.().warn("Unable to stop a retired Artifacts Git backend");
			}
		}
	}

	async dispose(): Promise<void> {
		this.#pendingRoots = undefined;
		this.#activeRoots.clear();
		await this.#closeExcept(this.#activeRoots);
	}
}

/**
 * Clones keep their `origin` URL, so reuse the port this storage directory had
 * last time. Fall back to any free port if another process now holds it.
 */
async function reserveGitPort(portFile: string | undefined): Promise<number> {
	if (portFile === undefined) {
		return getPort({ host: "127.0.0.1" });
	}
	const previous = Number.parseInt(
		await readFile(portFile, "utf8").catch(() => ""),
		10
	);
	// get-port refuses ports it returned in this process during the last
	// 15 seconds, which would move the port when Vite restarts its server.
	const port =
		Number.isInteger(previous) &&
		previous > 0 &&
		previous < 65536 &&
		(await isLoopbackPortFree(previous))
			? previous
			: await getPort({ host: "127.0.0.1" });
	if (port !== previous) {
		await mkdir(path.dirname(portFile), { recursive: true });
		await writeFile(portFile, `${port}\n`);
	}
	return port;
}

function isLoopbackPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.once("error", () => resolve(false));
		server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
			server.close(() => resolve(true));
		});
	});
}

type SidecarStartupMessage =
	| Pick<GitSidecar, "address" | "secret">
	| { error: string };

function waitForSidecarReady(
	worker: Worker
): Promise<Pick<GitSidecar, "address" | "secret">> {
	return new Promise((resolve, reject) => {
		function cleanup() {
			worker.off("message", ready);
			worker.off("error", failed);
			worker.off("exit", exited);
		}
		function ready(value: SidecarStartupMessage) {
			cleanup();
			if ("error" in value) {
				reject(
					new Error(
						`Local Artifacts Git backend failed to start: ${value.error}`
					)
				);
			} else {
				resolve(value);
			}
		}
		function failed(error: Error) {
			cleanup();
			reject(error);
		}
		function exited(code: number) {
			failed(
				new Error(`Local Artifacts Git backend exited during startup (${code})`)
			);
		}
		worker.on("message", ready);
		worker.on("error", failed);
		worker.on("exit", exited);
	});
}
