import path from "path";
import { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPlatformProxy } from "./shared";
import type { Hyperdrive, KVNamespace } from "@cloudflare/workers-types";
import type { UnstableDevWorker } from "wrangler";

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
};

const wranglerTomlFilePath = path.join(__dirname, "..", "wrangler.toml");

describe("getPlatformProxy - env", () => {
	let devWorkers: UnstableDevWorker[];

	beforeEach(() => {
		// Hide stdout messages from the test logs
		vi.spyOn(console, "log").mockImplementation(() => {});
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

	// Important: the hyperdrive values are passthrough ones since the workerd specific hyperdrive values only make sense inside
	//            workerd itself and would simply not work in a node.js process
	it("correctly obtains passthrough Hyperdrive bindings", async () => {
		const { env, dispose } = await getPlatformProxy<Env>({
			configPath: wranglerTomlFilePath,
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
