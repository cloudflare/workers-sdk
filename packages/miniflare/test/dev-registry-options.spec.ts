import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	getDefaultDevRegistryPath,
	getWorkerRegistry,
	Miniflare,
	MiniflareOptionsSchema,
	resolveDevRegistryPath,
} from "miniflare";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "./test-shared";

describe("dev registry options", { concurrent: false }, () => {
	let home: string;
	let config: string;
	const worker = {
		config: {
			name: "registry-options-worker",
			compatibilityDate: "2026-01-01",
			manifest: singleModuleManifest(
				`export default { fetch() { return new Response("ok"); } };`
			),
		},
	};

	beforeEach(async () => {
		const root = await useTmp();
		home = path.join(root, "home");
		config = path.join(root, "config");
		await fs.mkdir(home);
		vi.spyOn(os, "homedir").mockReturnValue(home);
		vi.stubEnv("XDG_CONFIG_HOME", config);
		vi.stubEnv("CLOUDFLARE_DEV_REGISTRY_PATH", undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	test("enables a Cloudflare registry scoped to the Miniflare major by default", ({
		expect,
	}) => {
		const parsed = MiniflareOptionsSchema.parse({ workers: [worker] });

		expect(parsed.enableDevRegistry).toBe(true);
		expect(parsed.unsafeDevRegistryPath).toBe(
			path.join(config, "cloudflare", "dev-registry", "v5")
		);
		expect(getDefaultDevRegistryPath()).toBe(parsed.unsafeDevRegistryPath);
		expect(resolveDevRegistryPath()).toBe(parsed.unsafeDevRegistryPath);
	});

	test("ignores legacy directories and environment variables", async ({
		expect,
	}) => {
		await fs.mkdir(path.join(home, ".wrangler", "registry"), {
			recursive: true,
		});
		await fs.mkdir(path.join(home, ".cloudflare", "registry"), {
			recursive: true,
		});
		vi.stubEnv("CLOUDFLARE_REGISTRY_PATH", "old-cf-registry");
		vi.stubEnv("WRANGLER_REGISTRY_PATH", "old-wrangler-registry");
		vi.stubEnv("MINIFLARE_REGISTRY_PATH", "old-miniflare-registry");

		const parsed = MiniflareOptionsSchema.parse({ workers: [worker] });

		expect(parsed.unsafeDevRegistryPath).toBe(
			path.join(config, "cloudflare", "dev-registry", "v5")
		);
	});

	test("uses the native Cloudflare config directory without an XDG override", ({
		expect,
	}) => {
		vi.stubEnv("XDG_CONFIG_HOME", undefined);
		vi.stubEnv("APPDATA", path.join(home, "AppData", "Roaming"));
		const base =
			process.platform === "darwin"
				? path.join(home, "Library", "Preferences")
				: process.platform === "win32"
					? path.join(home, "AppData", "Roaming", "xdg.config")
					: path.join(home, ".config");

		expect(getDefaultDevRegistryPath()).toBe(
			path.join(base, "cloudflare", "dev-registry", "v5")
		);
	});

	test.for(["relative registry", path.resolve("absolute registry")])(
		"uses an explicit constructor path: %s",
		(unsafeDevRegistryPath, { expect }) => {
			const parsed = MiniflareOptionsSchema.parse({
				unsafeDevRegistryPath,
				workers: [worker],
			});

			expect(parsed.unsafeDevRegistryPath).toBe(
				path.resolve(unsafeDevRegistryPath)
			);
			expect(resolveDevRegistryPath(unsafeDevRegistryPath)).toBe(
				parsed.unsafeDevRegistryPath
			);
		}
	);

	test.for([
		"relative environment registry",
		path.resolve("environment registry"),
	])(
		"lets the canonical environment variable override the constructor: %s",
		(registryPath, { expect }) => {
			vi.stubEnv("CLOUDFLARE_DEV_REGISTRY_PATH", registryPath);
			const parsed = MiniflareOptionsSchema.parse({
				unsafeDevRegistryPath: "constructor-registry",
				workers: [worker],
			});

			expect(parsed.unsafeDevRegistryPath).toBe(path.resolve(registryPath));
			expect(getDefaultDevRegistryPath()).toBe(path.resolve(registryPath));
			expect(resolveDevRegistryPath("constructor-registry")).toBe(
				parsed.unsafeDevRegistryPath
			);
		}
	);

	test("treats empty paths as unset", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_DEV_REGISTRY_PATH", "");
		const explicit = MiniflareOptionsSchema.parse({
			unsafeDevRegistryPath: "constructor-registry",
			workers: [worker],
		});
		const defaults = MiniflareOptionsSchema.parse({
			unsafeDevRegistryPath: "",
			workers: [worker],
		});

		expect(explicit.unsafeDevRegistryPath).toBe(
			path.resolve("constructor-registry")
		);
		expect(defaults.unsafeDevRegistryPath).toBe(
			path.join(config, "cloudflare", "dev-registry", "v5")
		);
	});

	test("explicitly disables the registry even when paths are configured", ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_DEV_REGISTRY_PATH", "environment-registry");
		const parsed = MiniflareOptionsSchema.parse({
			enableDevRegistry: false,
			unsafeDevRegistryPath: "constructor-registry",
			workers: [worker],
		});

		expect(parsed.unsafeDevRegistryPath).toBeUndefined();
	});

	test("registers Workers by default and withdraws them when disabled", async ({
		expect,
	}) => {
		const registryPath = path.join(config, "cloudflare", "dev-registry", "v5");
		const mf = new Miniflare({ workers: [worker] });
		useDispose(mf);
		await mf.ready;

		expect(getWorkerRegistry(registryPath)[worker.config.name]).toBeDefined();

		await mf.setOptions({ enableDevRegistry: false, workers: [worker] });
		expect(getWorkerRegistry(registryPath)).toEqual({});

		await mf.setOptions({ workers: [worker] });
		expect(getWorkerRegistry(registryPath)[worker.config.name]).toBeDefined();
	});

	test("uses the environment override in the running registry", async ({
		expect,
	}) => {
		const registryPath = await useTmp();
		const constructorPath = await useTmp();
		vi.stubEnv("CLOUDFLARE_DEV_REGISTRY_PATH", registryPath);
		const mf = new Miniflare({
			unsafeDevRegistryPath: constructorPath,
			workers: [worker],
		});
		useDispose(mf);
		await mf.ready;

		expect(getWorkerRegistry(registryPath)[worker.config.name]).toBeDefined();
		expect(getWorkerRegistry(constructorPath)).toEqual({});
	});

	test("connects independent instances without configuring registry paths", async ({
		expect,
	}) => {
		const remote = new Miniflare({ workers: [worker] });
		useDispose(remote);
		await remote.ready;

		const local = new Miniflare({
			workers: [
				{
					config: {
						name: "registry-options-client",
						compatibilityDate: "2026-01-01",
						manifest: singleModuleManifest(
							`export default { fetch(request, env) { return env.SERVICE.fetch(request); } };`
						),
						env: {
							SERVICE: { type: "worker", worker: worker.config.name },
						},
					},
				},
			],
		});
		useDispose(local);

		const response = await local.dispatchFetch("http://localhost/");
		expect(await response.text()).toBe("ok");
		expect(response.status).toBe(200);
	});

	test("starts shared storage without an explicit registry path", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: await useTmp(),
			isolatedResourcePersistencePath: await useTmp(),
			workers: [worker],
		});
		useDispose(mf);
		await mf.ready;

		const registry = getWorkerRegistry(
			path.join(config, "cloudflare", "dev-registry", "v5")
		);
		expect(registry[worker.config.name]).toBeDefined();
		expect(Object.keys(registry)).toHaveLength(2);
	});
});
