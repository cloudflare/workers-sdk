import assert from "node:assert";
import { dirname } from "node:path";
import { env } from "cloudflare:workers";
import { VitestSnapshotEnvironment } from "vitest/runtime";

// Define a custom `SnapshotEnvironment` that uses a service binding for file
// system operations, rather than `node:fs`
class WorkersSnapshotEnvironment extends VitestSnapshotEnvironment {
	#fetch(method: string, path: string, body?: BodyInit): Promise<Response> {
		const encodedPath = encodeURIComponent(path);
		const url = `http://placeholder/snapshot?path=${encodedPath}`;
		return env.__VITEST_POOL_WORKERS_LOOPBACK_SERVICE.fetch(url, {
			method,
			body,
		});
	}

	async prepareDirectory(dirPath: string): Promise<void> {
		const res = await this.#fetch("POST", dirPath);
		assert.strictEqual(res.status, 204);
	}

	async saveSnapshotFile(filePath: string, snapshot: string): Promise<void> {
		await this.prepareDirectory(dirname(filePath));
		const res = await this.#fetch("PUT", filePath, snapshot);
		assert.strictEqual(res.status, 204);
	}

	async readSnapshotFile(filePath: string): Promise<string | null> {
		const res = await this.#fetch("GET", filePath);
		if (res.status === 404) {
			return null;
		}
		assert.strictEqual(res.status, 200);
		return await res.text();
	}

	async removeSnapshotFile(filePath: string): Promise<void> {
		const res = await this.#fetch("DELETE", filePath);
		assert.strictEqual(res.status, 204);
	}
}
export default new WorkersSnapshotEnvironment();
