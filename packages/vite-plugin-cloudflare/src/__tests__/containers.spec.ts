import fs from "node:fs";
import path from "node:path";
import { OpenAPI } from "@cloudflare/containers-shared";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { resolveConfig } from "vite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import * as wrangler from "wrangler";
import { configureContainerPull } from "../containers";
import { getPreviewMiniflareOptions } from "../miniflare-options";
import type { PreviewPluginContext } from "../context";
import type { PreviewResolvedConfig } from "../plugin-config";
import type * as vite from "vite";
import type { Unstable_Config } from "wrangler";

describe("configureContainerPull", () => {
	beforeEach(() => {
		vi.stubEnv("CLOUDFLARE_API_BASE_URL", undefined);
		vi.stubEnv("CF_API_BASE_URL", undefined);
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", undefined);
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		OpenAPI.BASE = "";
		OpenAPI.HEADERS = undefined;
		OpenAPI.CREDENTIALS = "include";
	});

	test("uses the FedRAMP High API for managed registry credentials", ({
		expect,
	}) => {
		configureContainerPull("abc123", "my-token", {
			compliance_region: "fedramp_high",
		});

		expect(OpenAPI.BASE).toBe(
			"https://api.fed.cloudflare.com/client/v4/accounts/abc123/containers"
		);
	});

	test("uses the staging FedRAMP High API for managed registry credentials", ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");

		configureContainerPull("abc123", "my-token", {
			compliance_region: "fedramp_high",
		});

		expect(OpenAPI.BASE).toBe(
			"https://api.fed.staging.cloudflare.com/client/v4/accounts/abc123/containers"
		);
	});

	test("preserves the explicit API base override", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_BASE_URL", "https://api.example.com/client/v4");

		configureContainerPull("abc123", "my-token", {
			compliance_region: "fedramp_high",
		});

		expect(OpenAPI.BASE).toBe(
			"https://api.example.com/client/v4/accounts/abc123/containers"
		);
	});
});

describe("Container image planning", () => {
	runInTempDir();

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("uses independent image tags for each preview Worker", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_DOCKER_HOST", "unix:///test/docker.sock");

		function createWorkerConfig(name: string): Unstable_Config {
			const directory = path.resolve(name);
			fs.mkdirSync(directory);
			fs.writeFileSync(path.join(directory, "index.js"), "export default {};");
			fs.writeFileSync(path.join(directory, "Dockerfile"), `FROM ${name}`);
			const configPath = path.join(directory, "wrangler.jsonc");
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					name,
					main: "./index.js",
					compatibility_date: "2026-09-05",
					containers: [
						{
							name: "managed-container",
							class_name: "ContainerDO",
							scheduling_policy: "durable_object",
							images: { app: { dockerfile: "./Dockerfile" } },
						},
					],
					durable_objects: {
						bindings: [{ name: "CONTAINER", class_name: "ContainerDO" }],
					},
					migrations: [{ tag: "v1", new_sqlite_classes: ["ContainerDO"] }],
				})
			);
			return wrangler.unstable_readConfig({ config: configPath });
		}

		const resolvedViteConfig = await resolveConfig(
			{ logLevel: "silent", root: process.cwd() },
			"serve"
		);
		const resolvedPluginConfig: PreviewResolvedConfig = {
			type: "preview",
			workers: ["first", "second"].map((name) => ({
				source: "legacy",
				config: createWorkerConfig(name),
			})),
			persistState: false,
			inspectorPort: false,
			experimental: { headersAndRedirectsDevModeSupport: false },
			remoteBindings: false,
			tunnel: { autoStart: false },
		};
		const ctx = {
			resolvedPluginConfig,
			resolvedViteConfig,
		} as PreviewPluginContext;
		const vitePreviewServer = {
			config: resolvedViteConfig,
		} as vite.PreviewServer;

		const { containerTagToOptionsMap } = await getPreviewMiniflareOptions(
			ctx,
			vitePreviewServer
		);

		expect(containerTagToOptionsMap.size).toBe(2);
		expect(new Set(containerTagToOptionsMap.keys()).size).toBe(2);
		expect(
			new Set(
				[...containerTagToOptionsMap.values()].map((option) =>
					"dockerfile" in option ? option.dockerfile : undefined
				)
			)
		).toEqual(
			new Set([
				path.resolve("first/Dockerfile"),
				path.resolve("second/Dockerfile"),
			])
		);
	});
});
