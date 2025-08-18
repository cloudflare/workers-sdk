import path from "path";
import { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { toMatchImageSnapshot } from "jest-image-snapshot";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	MockInstance,
	vi,
} from "vitest";
import { getPlatformProxy } from "./shared";
import type {
	Fetcher,
	Hyperdrive,
	ImagesBinding,
	KVNamespace,
} from "@cloudflare/workers-types";
import type { Unstable_DevWorker } from "wrangler";

type Env = {
	MY_VAR: string;
	MY_VAR_A: string;
	MY_JSON_VAR: Object;
	MY_DEV_VAR: string;
	MY_KV: KVNamespace;
	MY_KV_PROD: KVNamespace;
	MY_BUCKET: R2Bucket;
	MY_D1: D1Database;
	MY_HYPERDRIVE: Hyperdrive;
	ASSETS: Fetcher;
	IMAGES: ImagesBinding;
};

const wranglerConfigFilePath = path.join(__dirname, "..", "wrangler.jsonc");

describe("getPlatformProxy - env", () => {
	let devWorkers: Unstable_DevWorker[];

	beforeEach(() => {
		// Hide stdout messages from the test logs
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	describe("var bindings", () => {
		it("correctly obtains var bindings from both wrangler config and .dev.vars", async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerConfigFilePath,
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

		it("correctly makes vars from .dev.vars override the ones in wrangler config", async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerConfigFilePath,
			});
			try {
				const { MY_VAR_A } = env;
				expect(MY_VAR_A).not.toEqual("my-var-a"); // if this fails, the value was read from wrangler config – not .dev.vars
				expect(MY_VAR_A).toEqual("my-dev-var-a");
			} finally {
				await dispose();
			}
		});

		it("correctly makes vars from .dev.vars not override bindings of the same name from wrangler config", async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerConfigFilePath,
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
					"test.toml"
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

	it("correctly obtains functioning ASSETS bindings", async () => {
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerConfigFilePath,
		});
		const res = await env.ASSETS.fetch("https://0.0.0.0/test.txt");
		const text = await res.text();
		expect(text).toEqual("this is a test text file!\n");
		await dispose();
	});

	it("correctly obtains functioning KV bindings", async () => {
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerConfigFilePath,
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

	it("correctly obtains functioning R2 bindings", async () => {
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerConfigFilePath,
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
			configPath: wranglerConfigFilePath,
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

	it("correctly obtains functioning Image bindings", async () => {
		expect.extend({ toMatchImageSnapshot });

		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerConfigFilePath,
		});
		try {
			const { IMAGES } = env;
			const streams = (
				await fetch("https://playground.devprod.cloudflare.dev/flares.png")
			).body!.tee();

			// @ts-expect-error The stream types aren't matching up properly?
			expect(await IMAGES.info(streams[0])).toMatchInlineSnapshot(`
				{
				  "fileSize": 96549,
				  "format": "image/png",
				  "height": 1145,
				  "width": 2048,
				}
			`);

			// @ts-expect-error The stream types aren't matching up properly?
			const response = await env.IMAGES.input(streams[1])
				.transform({ rotate: 90 })
				.transform({ width: 128, height: 100 })
				.transform({ blur: 20 })
				.output({ format: "image/png" });

			expect(
				Buffer.from(await response.response().arrayBuffer())
			).toMatchImageSnapshot();
		} finally {
			await dispose();
		}
	});

	// Important: the hyperdrive values are passthrough ones since the workerd specific hyperdrive values only make sense inside
	//            workerd itself and would simply not work in a node.js process
	it("correctly obtains passthrough Hyperdrive bindings", async () => {
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerConfigFilePath,
		});
		try {
			const { MY_HYPERDRIVE } = env;
			expect(MY_HYPERDRIVE.connectionString).toEqual(
				"postgres://user:pass@127.0.0.1:1234/db"
			);
			expect(MY_HYPERDRIVE.database).toEqual("db");
			expect(MY_HYPERDRIVE.host).toEqual("127.0.0.1");
			expect(MY_HYPERDRIVE.user).toEqual("user");
			expect(MY_HYPERDRIVE.password).toEqual("pass");
			expect(MY_HYPERDRIVE.port).toEqual(1234);
		} finally {
			await dispose();
		}
	});

	describe("DO warnings", () => {
		let warn = {} as MockInstance<typeof console.warn>;
		beforeEach(() => {
			warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		});
		afterEach(() => {
			warn.mockRestore();
		});

		it("warns about internal DOs and doesn't crash", async () => {
			await getPlatformProxy<Env>({
				configPath: path.join(__dirname, "..", "wrangler_internal_do.jsonc"),
			});
			expect(warn).toMatchInlineSnapshot(`
				[MockFunction warn] {
				  "calls": [
				    [
				      "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m				You have defined bindings to the following internal Durable Objects:[0m

				  				- {"class_name":"MyDurableObject","name":"MY_DURABLE_OBJECT"}
				  				These will not work in local development, but they should work in production.
				  
				  				If you want to develop these locally, you can define your DO in a separate Worker, with a separate configuration file.
				  				For detailed instructions, refer to the Durable Objects section here: [4mhttps://developers.cloudflare.com/workers/wrangler/api#supported-bindings[0m

				",
				    ],
				  ],
				  "results": [
				    {
				      "type": "return",
				      "value": undefined,
				    },
				  ],
				}
			`);
		});

		it("doesn't warn about external DOs and doesn't crash", async () => {
			await getPlatformProxy<Env>({
				configPath: path.join(__dirname, "..", "wrangler_external_do.jsonc"),
			});
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("with a target environment", () => {
		it("should provide bindings targeting a specified environment and also inherit top-level ones", async () => {
			const { env, dispose } = await getPlatformProxy<Env>({
				configPath: wranglerConfigFilePath,
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
				configPath: wranglerConfigFilePath,
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
				configPath: wranglerConfigFilePath,
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
					configPath: wranglerConfigFilePath,
					environment: "non-existent-environment",
				})
			).rejects.toThrow(
				/No environment found in configuration with name "non-existent-environment"/
			);
		});
	});
});
