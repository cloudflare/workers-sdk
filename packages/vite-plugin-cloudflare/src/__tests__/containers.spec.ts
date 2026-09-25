import fs from "node:fs";
import path from "node:path";
import {
	OpenAPI,
	prepareContainerImagesForDev,
} from "@cloudflare/containers-shared";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { resolveConfig } from "vite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import * as wrangler from "wrangler";
import {
	configureContainerPull,
	normalizeContainerImageUris,
	prepareContainerImagesForVite,
} from "../containers";
import { getPreviewMiniflareOptions } from "../miniflare-options";
import type { ContainerOptionsByWorker } from "../containers";
import type { PreviewPluginContext } from "../context";
import type { PreviewResolvedConfig } from "../plugin-config";
import type * as vite from "vite";
import type { Unstable_Config } from "wrangler";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@cloudflare/containers-shared")>();
	return { ...original, prepareContainerImagesForDev: vi.fn() };
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.mocked(prepareContainerImagesForDev).mockReset();
	OpenAPI.BASE = "";
	OpenAPI.HEADERS = undefined;
	OpenAPI.CREDENTIALS = "include";
});

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

describe("configureContainerPull", () => {
	beforeEach(() => {
		vi.stubEnv("CLOUDFLARE_API_BASE_URL", undefined);
		vi.stubEnv("CF_API_BASE_URL", undefined);
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", undefined);
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", undefined);
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

test("qualifies managed-registry images for the selected account", ({
	expect,
}) => {
	expect(
		normalizeContainerImageUris(
			[
				{
					image_uri: "registry.cloudflare.com/app:latest",
					image_tag: "cloudflare-dev/app:build-id",
					class_name: "ContainerDO",
				},
				{
					image_uri: "docker.io/example/app:latest",
					image_tag: "cloudflare-dev/external:build-id",
					class_name: "ContainerDO",
				},
			],
			"abc123"
		)
	).toEqual([
		expect.objectContaining({
			image_uri: "registry.cloudflare.com/abc123/app:latest",
		}),
		expect.objectContaining({
			image_uri: "docker.io/example/app:latest",
		}),
	]);
});

test("prepares registry images with their owning Worker configuration", async ({
	expect,
}) => {
	vi.stubEnv("CLOUDFLARE_API_BASE_URL", undefined);
	vi.stubEnv("CF_API_BASE_URL", undefined);
	vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", undefined);
	vi.stubEnv("CLOUDFLARE_CONTAINER_REGISTRY", undefined);
	vi.stubEnv("WRANGLER_API_ENVIRONMENT", undefined);
	vi.stubEnv("CLOUDFLARE_API_TOKEN", "my-token");
	vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);

	const preparations: Array<{
		apiBase: string;
		image: string;
		complianceRegion: string | undefined;
	}> = [];
	vi.mocked(prepareContainerImagesForDev).mockImplementation(
		async ({ containerOptions, complianceConfig }) => {
			const option = containerOptions[0];
			if (option === undefined || !("image_uri" in option)) {
				throw new Error("Expected a registry image");
			}
			preparations.push({
				apiBase: OpenAPI.BASE,
				image: option.image_uri,
				complianceRegion: complianceConfig?.compliance_region,
			});
			return { aborted: false };
		}
	);

	const containerOptionsByWorker: ContainerOptionsByWorker = new Map([
		[
			{ account_id: "standard-account" },
			[
				{
					image_uri: "registry.cloudflare.com/standard:latest",
					image_tag: "cloudflare-dev/standard:build-id",
					class_name: "StandardDO",
				},
			],
		],
		[
			{ account_id: "fedramp-account", compliance_region: "fedramp_high" },
			[
				{
					image_uri: "registry.fed.cloudflare.com/fedramp:latest",
					image_tag: "cloudflare-dev/fedramp:build-id",
					class_name: "FedRampDO",
				},
			],
		],
	]);

	await prepareContainerImagesForVite({
		dockerPath: "docker",
		containerOptionsByWorker,
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	});

	expect(preparations).toEqual([
		{
			apiBase:
				"https://api.cloudflare.com/client/v4/accounts/standard-account/containers",
			image: "registry.cloudflare.com/standard-account/standard:latest",
			complianceRegion: undefined,
		},
		{
			apiBase:
				"https://api.fed.cloudflare.com/client/v4/accounts/fedramp-account/containers",
			image: "registry.fed.cloudflare.com/fedramp-account/fedramp:latest",
			complianceRegion: "fedramp_high",
		},
	]);
});

test("prepares the sidecar for a configured Worker without images or registry credentials", async ({
	expect,
}) => {
	vi.stubEnv("CLOUDFLARE_API_TOKEN", undefined);
	vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
	await prepareContainerImagesForVite({
		dockerPath: "test-docker",
		containerOptionsByWorker: new Map([[{}, []]]),
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	});
	expect(prepareContainerImagesForDev).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({
			dockerPath: "test-docker",
			containerOptions: [],
		})
	);
	expect(OpenAPI.BASE).toBe("");
});

describe("Container image planning", () => {
	runInTempDir();

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
					account_id: `${name}-account`,
					main: "./index.js",
					compatibility_date: "2026-09-05",
					containers: [
						{
							name: "managed-container",
							scheduling_policy: "durable_object",
							images: { app: { dockerfile: "./Dockerfile" } },
						},
					],
					exports: {
						ContainerDO: {
							type: "durable-object",
							storage: "sqlite",
							container: "managed-container",
						},
					},
					durable_objects: {
						bindings: [{ name: "CONTAINER", class_name: "ContainerDO" }],
					},
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

		const { miniflareOptions, containerOptionsByWorker } =
			await getPreviewMiniflareOptions(ctx, vitePreviewServer);

		expect(containerOptionsByWorker.size).toBe(2);
		const plannedImages = [...containerOptionsByWorker].flatMap(
			([workerConfig, options]) =>
				options.map((containerOptions) => ({ workerConfig, containerOptions }))
		);
		const imageTags = new Set(
			plannedImages.map(({ containerOptions }) => containerOptions.image_tag)
		);
		expect(imageTags.size).toBe(2);
		expect(
			new Set(
				plannedImages.map(({ containerOptions }) =>
					"dockerfile" in containerOptions
						? containerOptions.dockerfile
						: undefined
				)
			)
		).toEqual(
			new Set([
				path.resolve("first/Dockerfile"),
				path.resolve("second/Dockerfile"),
			])
		);
		expect(
			new Map(
				plannedImages.map(({ containerOptions, workerConfig }) => [
					"dockerfile" in containerOptions
						? containerOptions.dockerfile
						: undefined,
					workerConfig.account_id,
				])
			)
		).toEqual(
			new Map([
				[path.resolve("first/Dockerfile"), "first-account"],
				[path.resolve("second/Dockerfile"), "second-account"],
			])
		);
		const runtimeImageTags = miniflareOptions.workers.flatMap((worker) =>
			Object.values(worker.config.exports ?? {}).flatMap((workerExport) => {
				const images = asRecord(asRecord(workerExport)?.container)?.images;
				return Array.isArray(images)
					? images.flatMap((image) => {
							const reference = asRecord(image)?.image;
							return typeof reference === "string" ? [reference] : [];
						})
					: [];
			})
		);
		expect(new Set(runtimeImageTags)).toEqual(imageTags);
	});
});
