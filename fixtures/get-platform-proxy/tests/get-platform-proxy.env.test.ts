import { readdir } from "fs/promises";
import path from "path";
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
import { unstable_dev } from "wrangler";
import { getPlatformProxy } from "./shared";
import type { NamedEntrypoint } from "../workers/rpc-worker";
import type { KVNamespace, Rpc, Service } from "@cloudflare/workers-types";
import type { UnstableDevWorker } from "wrangler";

type Env = {
	MY_VAR: string;
	MY_VAR_A: string;
	MY_JSON_VAR: Object;
	MY_DEV_VAR: string;
	MY_SERVICE_A: Fetcher;
	MY_SERVICE_B: Fetcher;
	MY_RPC: Service;
	MY_KV: KVNamespace;
	MY_KV_PROD: KVNamespace;
	MY_DO_A: DurableObjectNamespace;
	MY_DO_B: DurableObjectNamespace;
	MY_BUCKET: R2Bucket;
	MY_D1: D1Database;
};

const wranglerTomlFilePath = path.join(__dirname, "..", "wrangler.toml");

describe("getPlatformProxy - env", () => {
	let devWorkers: UnstableDevWorker[];

	beforeEach(() => {
		// Hide stdout messages from the test logs
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	beforeAll(async () => {
		devWorkers = await startWorkers();
	});

	afterAll(async () => {
		await Promise.allSettled(devWorkers.map((i) => i.stop()));
	});

	describe("var bindings", () => {
		it("correctly obtains var bindings from both wrangler.toml and .dev.vars", async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerTomlFilePath,
			});
			try {
				const { MY_VAR, MY_JSON_VAR, MY_DEV_VAR } = env;
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
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerTomlFilePath,
			});
			try {
				const { MY_VAR_A } = env;
				expect(MY_VAR_A).not.toEqual("my-var-a"); // if this fails, the value was read from wrangler.toml – not .dev.vars
				expect(MY_VAR_A).toEqual("my-dev-var-a");
			} finally {
				await dispose();
			}
		});

		it("correctly makes vars from .dev.vars not override bindings of the same name from wrangler.toml", async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerTomlFilePath,
			});
			try {
				const { MY_KV } = env;
				expect(MY_KV).not.toEqual("my-dev-kv");
				["get", "delete", "list", "put", "getWithMetadata"].every(
					(methodName) =>
						expect(
							typeof (MY_KV as unknown as Record<string, unknown>)[methodName]
						).toBe("function")
				);
			} finally {
				await dispose();
			}
		});

		it("correctly reads a toml from a custom path alongside with its .dev.vars", async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: path.join(
					__dirname,
					"..",
					"custom-toml",
					"path",
					"test-toml"
				),
			});
			try {
				const { MY_VAR, MY_JSON_VAR, MY_DEV_VAR } = env;
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
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: path.join(__dirname, "..", "wrangler.json"),
		});
		try {
			const { MY_VAR, MY_JSON_VAR } = env;
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
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerTomlFilePath,
		});
		try {
			const { MY_SERVICE_A, MY_SERVICE_B } = env;
			await testServiceBinding(MY_SERVICE_A, "Hello World from hello-worker-a");
			await testServiceBinding(MY_SERVICE_B, "Hello World from hello-worker-b");
		} finally {
			await dispose();
		}
	});

	type EntrypointService = Service<
		Omit<NamedEntrypoint, "getCounter" | "getHelloWorldFn" | "getHelloFn"> &
			Rpc.WorkerEntrypointBranded
	> & {
		getCounter: () => Promise<
			Promise<{
				value: Promise<number>;
				increment: (amount: number) => Promise<number>;
			}>
		>;
		getHelloWorldFn: () => Promise<() => Promise<string>>;
		getHelloFn: () => Promise<
			(
				greet: string,
				name: string,
				options?: {
					suffix?: string;
					capitalize?: boolean;
				}
			) => Promise<string>
		>;
	};

	describe("provides rpc service bindings to external local workers", () => {
		let rpc: EntrypointService;
		beforeEach(async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerTomlFilePath,
			});
			rpc = env.MY_RPC as unknown as EntrypointService;
			return dispose;
		});
		it("can call RPC methods returning a string", async () => {
			expect(await rpc.sum([1, 2, 3])).toMatchInlineSnapshot(`6`);
		});
		it("can call RPC methods returning an object", async () => {
			expect(await rpc.sumObj([1, 2, 3, 5])).toEqual({
				isObject: true,
				value: 11,
			});
		});
		it("can call RPC methods returning a Response", async () => {
			const resp = await rpc.asJsonResponse([1, 2, 3]);
			expect(resp.status).toMatchInlineSnapshot(`200`);
			expect(await resp.text()).toMatchInlineSnapshot(`"[1,2,3]"`);
		});
		it("can obtain and interact with RpcStubs", async () => {
			const counter = await rpc.getCounter();
			expect(await counter.value).toMatchInlineSnapshot(`0`);
			expect(await counter.increment(4)).toMatchInlineSnapshot(`4`);
			expect(await counter.increment(8)).toMatchInlineSnapshot(`12`);
			expect(await counter.value).toMatchInlineSnapshot(`12`);
		});
		it("can obtain and interact with returned functions", async () => {
			const helloWorldFn = await rpc.getHelloWorldFn();
			expect(helloWorldFn()).toEqual("Hello World!");

			const helloFn = await rpc.getHelloFn();
			expect(await helloFn("hi", "world")).toEqual("hi world");
			expect(
				await helloFn("hi", "world", {
					capitalize: true,
				})
			).toEqual("HI WORLD");
			expect(
				await helloFn("Sup", "world", {
					capitalize: true,
					suffix: "?!",
				})
			).toEqual("SUP WORLD?!");
		});
	});

	it("correctly obtains functioning KV bindings", async () => {
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerTomlFilePath,
		});
		const { MY_KV } = env;
		let numOfKeys = (await MY_KV.list()).keys.length;
		expect(numOfKeys).toBe(0);
		await MY_KV.put("my-key", "my-value");
		numOfKeys = (await MY_KV.list()).keys.length;
		expect(numOfKeys).toBe(1);
		const value = await MY_KV.get("my-key");
		expect(value).toBe("my-value");
		await dispose();
	});

	it("correctly obtains functioning DO bindings (provided by external local workers)", async () => {
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerTomlFilePath,
		});
		try {
			const { MY_DO_A, MY_DO_B } = env;
			await testDoBinding(MY_DO_A, "Hello from DurableObject A");
			await testDoBinding(MY_DO_B, "Hello from DurableObject B");
		} finally {
			await dispose();
		}
	});

	it("correctly obtains functioning R2 bindings", async () => {
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerTomlFilePath,
		});
		try {
			const { MY_BUCKET } = env;
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
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerTomlFilePath,
		});
		try {
			const { MY_D1 } = env;
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

	describe("with a target environment", () => {
		it("should provide bindings targeting a specified environment and also inherit top-level ones", async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerTomlFilePath,
				environment: "production",
			});
			try {
				expect(env.MY_VAR).not.toBe("my-var-value");
				expect(env.MY_VAR).toBe("my-PRODUCTION-var-value");
				expect(env.MY_JSON_VAR).toEqual({ test: true, production: true });

				expect(env.MY_KV).toBeTruthy();
				expect(env.MY_KV_PROD).toBeTruthy();
			} finally {
				await dispose();
			}
		});

		it("should not provide bindings targeting an environment when none was specified", async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerTomlFilePath,
			});
			try {
				expect(env.MY_VAR).not.toBe("my-PRODUCTION-var-value");
				expect(env.MY_VAR).toBe("my-var-value");
				expect(env.MY_JSON_VAR).toEqual({ test: true });

				expect(env.MY_KV).toBeTruthy();
				expect(env.MY_KV_PROD).toBeFalsy();
			} finally {
				await dispose();
			}
		});

		it("should provide secrets targeting a specified environment", async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerTomlFilePath,
				environment: "production",
			});
			try {
				const { MY_DEV_VAR } = env;
				expect(MY_DEV_VAR).not.toEqual("my-dev-var-value");
				expect(MY_DEV_VAR).toEqual("my-PRODUCTION-dev-var-value");
			} finally {
				await dispose();
			}
		});

		it("should error if a non-existent environment is provided", async () => {
			await expect(
				getPlatformProxy({
					configPath: wranglerTomlFilePath,
					environment: "non-existent-environment",
				})
			).rejects.toThrow(
				/No environment found in configuration with name "non-existent-environment"/
			);
		});
	});
});

/**
 * Starts all the workers present in the `workers` directory using `unstable_dev`
 *
 * @returns the workers' UnstableDevWorker instances
 */
async function startWorkers(): Promise<UnstableDevWorker[]> {
	const workersDirPath = path.join(__dirname, "..", "workers");
	const workers = await readdir(workersDirPath);
	return await Promise.all(
		workers.map((workerName) => {
			const workerPath = path.join(workersDirPath, workerName);
			return unstable_dev(path.join(workerPath, "index.ts"), {
				config: path.join(workerPath, "wrangler.toml"),
				ip: "127.0.0.1",
			});
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
