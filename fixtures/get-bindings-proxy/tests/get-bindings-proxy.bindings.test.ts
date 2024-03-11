import { readdir } from "fs/promises";
import path from "path";
import { setTimeout } from "timers/promises";
import {
	D1Database,
	DurableObjectNamespace,
	Fetcher,
	R2Bucket,
} from "@cloudflare/workers-types";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";
import { getBindingsProxy } from "./shared";
import type { KVNamespace } from "@cloudflare/workers-types";

type Bindings = {
	MY_VAR: string;
	MY_VAR_A: string;
	MY_JSON_VAR: Object;
	MY_DEV_VAR: string;
	MY_SERVICE_A: Fetcher;
	MY_SERVICE_B: Fetcher;
	MY_KV: KVNamespace;
	MY_DO_A: DurableObjectNamespace;
	MY_DO_B: DurableObjectNamespace;
	MY_BUCKET: R2Bucket;
	MY_D1: D1Database;
};

const wranglerTomlFilePath = path.join(__dirname, "..", "wrangler.toml");

describe("getBindingsProxy - bindings", () => {
	let devWorkers: Awaited<ReturnType<typeof startWorkers>>;

	beforeEach(() => {
		// Hide stdout messages from the test logs
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	beforeAll(async () => {
		devWorkers = await startWorkers();
		await setTimeout(1000);
	});

	afterAll(async () => {
		await Promise.allSettled(devWorkers.map((i) => i.stop()));
	});

	describe("var bindings", () => {
		it("correctly obtains var bindings from both wrangler.toml and .dev.vars", async () => {
			const { bindings, dispose } = await getBindingsProxy<Bindings>({
				configPath: wranglerTomlFilePath,
			});
			try {
				const { MY_VAR, MY_JSON_VAR, MY_DEV_VAR } = bindings;
				expect(MY_VAR).toEqual("my-var-value");
				expect(MY_JSON_VAR).toEqual({
					test: true,
				});
				expect(MY_DEV_VAR).toEqual("my-dev-var-value");
			} finally {
				await dispose();
			}
		});

		it("correctly makes vars from .dev.vars override the ones in wrangler.toml", async () => {
			const { bindings, dispose } = await getBindingsProxy<Bindings>({
				configPath: wranglerTomlFilePath,
			});
			try {
				const { MY_VAR_A } = bindings;
				expect(MY_VAR_A).not.toEqual("my-var-a"); // if this fails, the value was read from wrangler.toml – not .dev.vars
				expect(MY_VAR_A).toEqual("my-dev-var-a");
			} finally {
				await dispose();
			}
		});

		it("correctly makes vars from .dev.vars not override bindings of the same name from wrangler.toml", async () => {
			const { bindings, dispose } = await getBindingsProxy<Bindings>({
				configPath: wranglerTomlFilePath,
			});
			try {
				const { MY_KV } = bindings;
				expect(MY_KV).not.toEqual("my-dev-kv");
				["get", "delete", "list", "put", "getWithMetadata"].every(
					(methodName) => expect(typeof MY_KV[methodName]).toBe("function")
				);
			} finally {
				await dispose();
			}
		});

		it("correctly reads a toml from a custom path alongside with its .dev.vars", async () => {
			const { bindings, dispose } = await getBindingsProxy<Bindings>({
				configPath: path.join(
					__dirname,
					"..",
					"custom-toml",
					"path",
					"test-toml"
				),
			});
			try {
				const { MY_VAR, MY_JSON_VAR, MY_DEV_VAR } = bindings;
				expect(MY_VAR).toEqual("my-var-value-from-a-custom-toml");
				expect(MY_JSON_VAR).toEqual({
					test: true,
					customToml: true,
				});
				expect(MY_DEV_VAR).toEqual("my-dev-var-value-from-a-custom-location");
			} finally {
				await dispose();
			}
		});
	});

	it("correctly reads a json config file", async () => {
		const { bindings, dispose } = await getBindingsProxy<Bindings>({
			configPath: path.join(__dirname, "..", "wrangler.json"),
		});
		try {
			const { MY_VAR, MY_JSON_VAR } = bindings;
			expect(MY_VAR).toEqual("my-var-value-from-a-json-config-file");
			expect(MY_JSON_VAR).toEqual({
				test: true,
				fromJson: true,
			});
		} finally {
			await dispose();
		}
	});

	it("provides service bindings to external local workers", async () => {
		const { bindings, dispose } = await getBindingsProxy<Bindings>({
			configPath: wranglerTomlFilePath,
		});

		try {
			const { MY_SERVICE_A, MY_SERVICE_B } = bindings;
			await testServiceBinding(MY_SERVICE_A, "Hello World from hello-worker-a");
			await testServiceBinding(MY_SERVICE_B, "Hello World from hello-worker-b");
		} finally {
			await dispose();
		}
	});

	it("correctly obtains functioning KV bindings", async () => {
		const { bindings, dispose } = await getBindingsProxy<Bindings>({
			configPath: wranglerTomlFilePath,
		});
		const { MY_KV } = bindings;
		let numOfKeys = (await MY_KV.list()).keys.length;
		expect(numOfKeys).toBe(0);
		await MY_KV.put("my-key", "my-value");
		numOfKeys = (await MY_KV.list()).keys.length;
		expect(numOfKeys).toBe(1);
		const value = await MY_KV.get("my-key");
		expect(value).toBe("my-value");
		await dispose();
	});

	// Note: the following test is skipped due to flakiness caused by the local registry not working reliably
	//       when we run all our fixtures together (possibly because of race condition issues)
	it("correctly obtains functioning DO bindings (provided by external local workers)", async () => {
		const { bindings, dispose } = await getBindingsProxy<Bindings>({
			configPath: wranglerTomlFilePath,
		});
		try {
			const { MY_DO_A, MY_DO_B } = bindings;
			await testDoBinding(MY_DO_A, "Hello from DurableObject A");
			await testDoBinding(MY_DO_B, "Hello from DurableObject B");
		} finally {
			await dispose();
		}
	});

	it("correctly obtains functioning R2 bindings", async () => {
		const { bindings, dispose } = await getBindingsProxy<Bindings>({
			configPath: wranglerTomlFilePath,
		});
		try {
			const { MY_BUCKET } = bindings;
			let numOfObjects = (await MY_BUCKET.list()).objects.length;
			expect(numOfObjects).toBe(0);
			await MY_BUCKET.put("my-object", "my-value");
			numOfObjects = (await MY_BUCKET.list()).objects.length;
			expect(numOfObjects).toBe(1);
			const value = await MY_BUCKET.get("my-object");
			expect(await value?.text()).toBe("my-value");
		} finally {
			await dispose();
		}
	});

	it("correctly obtains functioning D1 bindings", async () => {
		const { bindings, dispose } = await getBindingsProxy<Bindings>({
			configPath: wranglerTomlFilePath,
		});
		try {
			const { MY_D1 } = bindings;
			await MY_D1.exec(
				`CREATE TABLE IF NOT EXISTS users ( id integer PRIMARY KEY AUTOINCREMENT, name text NOT NULL )`
			);
			const stmt = MY_D1.prepare("insert into users (name) values (?1)");
			await MY_D1.batch([
				stmt.bind("userA"),
				stmt.bind("userB"),
				stmt.bind("userC"),
			]);
			const { results } = await MY_D1.prepare(
				"SELECT name FROM users LIMIT 5"
			).all();
			expect(results).toEqual([
				{ name: "userA" },
				{ name: "userB" },
				{ name: "userC" },
			]);
		} finally {
			await dispose();
		}
	});
});

/**
 * Starts all the workers present in the `workers` directory using `unstable_dev`
 *
 * @returns the workers' UnstableDevWorker instances
 */
async function startWorkers() {
	const workersDirPath = path.join(__dirname, "..", "workers");
	const workers = await readdir(workersDirPath);
	return await Promise.all(
		workers.map(async (workerName) => {
			const workerPath = path.join(workersDirPath, workerName);
			return await runWranglerDev(workerPath, [
				"index.ts",
				"--inspector-port=0",
				"--port=0",
			]);
		})
	);
}

async function testServiceBinding(binding: Fetcher, expectedResponse: string) {
	const resp = await binding.fetch("http://0.0.0.0");
	const respText = await resp.text();
	expect(respText).toBe(expectedResponse);
}

async function testDoBinding(
	binding: DurableObjectNamespace,
	expectedResponse: string
) {
	const durableObjectId = binding.idFromName("__my-do__");
	const doStub = binding.get(durableObjectId);
	const doResp = await doStub.fetch("http://0.0.0.0");
	const doRespText = await doResp.text();
	expect(doRespText).toBe(expectedResponse);
}
