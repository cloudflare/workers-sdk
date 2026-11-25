import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { GitRelay } from "./git-relay";
import type { SocketPorts } from "../../runtime";
import type { Log } from "../../shared";
import type { GitSidecar } from "./git-sidecar";

export interface LocalArtifactsBackend {
	sidecar: GitSidecar;
	port: number;
}

export interface LocalArtifactsBackendOptions {
	namespace?: string;
	portFile?: string;
	socketName?: string;
}

interface Backend extends LocalArtifactsBackend {
	relay: GitRelay;
	socketName?: string;
}

// Node binding proxies make synchronous calls. The Git backend must run on
// another thread, otherwise those calls prevent it from answering workerd.
export class ArtifactsController {
	#backends = new Map<string, Promise<Backend>>();
	// Keep the old roots alive until workerd accepts the replacement config.
	#activeRoots = new Set<string>();
	#pendingRoots?: Set<string>;
	// Every open Git listener, including those of backends still starting.
	#relays = new Set<GitRelay>();

	constructor(private readonly getLog?: () => Pick<Log, "info" | "warn">) {}

	beginUpdate(): void {
		if (this.#pendingRoots) {
			throw new Error("Artifacts runtime update already in progress");
		}
		this.#pendingRoots = new Set();
	}

	/**
	 * @param socketPorts The ports the new workerd bound its sockets to, which
	 * each namespace's Git listener forwards to.
	 */
	async commitUpdate(socketPorts?: Pick<SocketPorts, "get">): Promise<void> {
		const roots = this.#pendingRoots;
		if (!roots) {
			throw new Error("No Artifacts runtime update to commit");
		}
		this.#pendingRoots = undefined;
		this.#activeRoots = roots;
		await this.#closeExcept(roots);
		for (const root of roots) {
			const backend = await this.#backends.get(root)?.catch(() => undefined);
			if (backend?.socketName !== undefined) {
				backend.relay.setRuntimePort(socketPorts?.get(backend.socketName));
			}
		}
	}

	/**
	 * Stops forwarding Git connections, until the next `commitUpdate()`. Call it
	 * before workerd stops, or once it has crashed: another process could take
	 * the port its Git socket had, and be sent the next request's token.
	 */
	detachRuntime(): void {
		for (const relay of this.#relays) {
			relay.setRuntimePort(undefined);
		}
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
	 * @param options.socketName The workerd socket Git connections are forwarded
	 * to, once `commitUpdate()` gives its port.
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
		{ namespace, portFile, socketName }: LocalArtifactsBackendOptions,
		onExit: () => void
	): Promise<Backend> {
		const relay = await listenForGit(portFile);
		this.#relays.add(relay);
		try {
			return await this.#startSidecar(
				root,
				relay,
				namespace,
				socketName,
				onExit
			);
		} catch (error) {
			await this.#closeRelay(relay);
			throw error;
		}
	}

	async #startSidecar(
		root: string,
		relay: GitRelay,
		namespace: string | undefined,
		socketName: string | undefined,
		onExit: () => void
	): Promise<Backend> {
		const { port } = relay;
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
			const closeRelay = () => this.#closeRelay(relay);
			let stopping = false;
			worker.on("error", () => {
				this.getLog?.().warn("Local Artifacts Git backend failed");
			});
			worker.once("exit", (code) => {
				onExit();
				// Frees the port for the backend that replaces this one.
				void closeRelay();
				if (!stopping) {
					this.getLog?.().warn(
						`Local Artifacts Git backend exited (${code}). Restart the dev server or reload its configuration to reconnect.`
					);
				}
			});
			return {
				port,
				relay,
				socketName,
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
						await closeRelay();
					},
				},
			};
		} catch (error) {
			await worker.terminate();
			throw error;
		}
	}

	async #closeRelay(relay: GitRelay): Promise<void> {
		this.#relays.delete(relay);
		await relay.close();
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
 * Clones keep their `origin` URL, so listen on the port this storage directory
 * had last time. Fall back to any free port if another process now holds it.
 */
async function listenForGit(portFile: string | undefined): Promise<GitRelay> {
	if (portFile === undefined) {
		return GitRelay.listen();
	}
	const previous = Number.parseInt(
		await readFile(portFile, "utf8").catch(() => ""),
		10
	);
	const relay = await GitRelay.listen(
		Number.isInteger(previous) && previous > 0 && previous < 65536
			? previous
			: undefined
	);
	try {
		if (relay.port !== previous) {
			await mkdir(path.dirname(portFile), { recursive: true });
			await writeFile(portFile, `${relay.port}\n`);
		}
	} catch (error) {
		await relay.close();
		throw error;
	}
	return relay;
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
