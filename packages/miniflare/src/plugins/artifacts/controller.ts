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

	get(root: string): Promise<LocalArtifactsBackend> {
		let backend = this.#backends.get(root);
		if (!backend) {
			backend = this.#start(root);
			this.#backends.set(root, backend);
			void backend.catch(() => this.#backends.delete(root));
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

	async dispose(): Promise<void> {
		const backends = [...this.#backends.values()];
		this.#backends.clear();
		await Promise.all(
			backends.map((backend) =>
				backend.then(
					({ sidecar }) => sidecar.close(),
					() => undefined
				)
			)
		);
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
