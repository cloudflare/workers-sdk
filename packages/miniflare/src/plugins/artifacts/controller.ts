import { once } from "node:events";
import path from "node:path";
import { Worker } from "node:worker_threads";
import getPort from "get-port";
import type { GitSidecar } from "./git-sidecar";

export interface LocalArtifactsBackend {
	sidecar: GitSidecar;
	port: number;
}

// Node binding proxies make synchronous calls. The Git backend must run on
// another thread, otherwise those calls prevent it from answering workerd.
export class ArtifactsController {
	#backends = new Map<string, Promise<LocalArtifactsBackend>>();
	// Keep the old roots alive until workerd accepts the replacement config.
	#activeRoots = new Set<string>();
	#pendingRoots?: Set<string>;

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

	get(root: string): Promise<LocalArtifactsBackend> {
		if (!this.#pendingRoots) {
			throw new Error("Artifacts backend requested outside runtime update");
		}
		this.#pendingRoots.add(root);
		let backend = this.#backends.get(root);
		if (!backend) {
			backend = this.#start(root);
			this.#backends.set(root, backend);
			void backend.catch(() => {
				if (this.#backends.get(root) === backend) {
					this.#backends.delete(root);
				}
			});
		}
		return backend;
	}

	async #start(root: string): Promise<LocalArtifactsBackend> {
		const port = await getPort({ host: "127.0.0.1" });
		// __dirname is dist/src in the bundled Miniflare entry point.
		const worker = new Worker(
			path.join(__dirname, "plugins/artifacts/git-sidecar.js"),
			{ workerData: { root } }
		);
		try {
			const endpoint = await waitForSidecarReady(worker);
			worker.on("error", (error) => {
				process.emitWarning(
					`Local Artifacts Git backend failed: ${error.message}`
				);
			});
			return {
				port,
				sidecar: {
					...endpoint,
					async close() {
						if (worker.threadId === -1) {
							return;
						}
						const exited = once(worker, "exit");
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
				process.emitWarning("Unable to stop a retired Artifacts Git backend");
			}
		}
	}

	async dispose(): Promise<void> {
		this.#pendingRoots = undefined;
		this.#activeRoots.clear();
		await this.#closeExcept(this.#activeRoots);
	}
}

function waitForSidecarReady(
	worker: Worker
): Promise<Pick<GitSidecar, "address" | "secret">> {
	return new Promise((resolve, reject) => {
		function cleanup() {
			worker.off("message", ready);
			worker.off("error", failed);
			worker.off("exit", exited);
		}
		function ready(value: Pick<GitSidecar, "address" | "secret">) {
			cleanup();
			resolve(value);
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
