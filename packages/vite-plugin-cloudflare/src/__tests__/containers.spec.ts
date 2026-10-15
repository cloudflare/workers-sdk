import {
	OpenAPI,
	prepareContainerImagesForDev,
} from "@cloudflare/containers-shared";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import {
	configureContainerPull,
	normalizeContainerImageUris,
	prepareContainerImagesForVite,
} from "../containers";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/containers-shared")>()),
	prepareContainerImagesForDev: vi.fn(async () => ({ aborted: false })),
}));

describe("normalizeContainerImageUris", () => {
	test("qualifies only Cloudflare-managed registry references", ({
		expect,
	}) => {
		const result = normalizeContainerImageUris({
			containerOptions: [
				{
					class_name: "ManagedDO",
					image_tag: "cloudflare-dev/manageddo:123",
					image_uri: "registry.cloudflare.com/api:latest",
				},
				{
					class_name: "ExternalDO",
					image_tag: "cloudflare-dev/externaldo:123",
					image_uri: "docker.io/example/api:latest",
				},
			],
			accountId: "abc123",
		});

		expect(result).toEqual([
			{
				class_name: "ManagedDO",
				image_tag: "cloudflare-dev/manageddo:123",
				image_uri: "registry.cloudflare.com/abc123/api:latest",
			},
			{
				class_name: "ExternalDO",
				image_tag: "cloudflare-dev/externaldo:123",
				image_uri: "docker.io/example/api:latest",
			},
		]);
	});
});

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

	test("uses the native compliance setting for registry credentials", ({
		expect,
	}) => {
		configureContainerPull("abc123", "my-token", {
			compliance_region: "fedramp_high",
		});

		expect(OpenAPI.BASE).toBe(
			"https://api.fed.cloudflare.com/client/v4/accounts/abc123/containers"
		);
	});

	test("uses the staging FedRAMP High API for registry credentials", ({
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

	test("preserves an explicit API base override", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_BASE_URL", "https://api.example.com/client/v4");

		configureContainerPull("abc123", "my-token", {
			compliance_region: "fedramp_high",
		});

		expect(OpenAPI.BASE).toBe(
			"https://api.example.com/client/v4/accounts/abc123/containers"
		);
	});
});

describe("prepareContainerImagesForVite", () => {
	beforeEach(() => {
		vi.mocked(prepareContainerImagesForDev)
			.mockReset()
			.mockResolvedValue({ aborted: false });
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "my-token");
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "abc123");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		OpenAPI.BASE = "";
		OpenAPI.HEADERS = undefined;
		OpenAPI.CREDENTIALS = "include";
	});

	test("prepares a managed-registry Build Output reference for preview", async ({
		expect,
	}) => {
		await prepareContainerImagesForVite({
			dockerPath: "docker",
			containerOptions: [
				{
					class_name: "ManagedDO",
					image_uri: "registry.cloudflare.com/api:latest",
					image_tag: "registry.cloudflare.com/api:latest",
				},
			],
			settings: {},
			logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		});

		expect(prepareContainerImagesForDev).toHaveBeenCalledWith(
			expect.objectContaining({
				containerOptions: [
					{
						class_name: "ManagedDO",
						image_uri: "registry.cloudflare.com/abc123/api:latest",
						image_tag: "registry.cloudflare.com/api:latest",
					},
				],
			})
		);
	});

	test("uses native project settings for public and FedRAMP registry images", async ({
		expect,
	}) => {
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

		await prepareContainerImagesForVite({
			dockerPath: "docker",
			containerOptions: [
				{
					class_name: "StandardDO",
					image_uri: "registry.cloudflare.com/standard:latest",
					image_tag: "registry.cloudflare.com/standard:latest",
				},
			],
			settings: { accountId: "standard-account" },
			logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		});
		await prepareContainerImagesForVite({
			dockerPath: "docker",
			containerOptions: [
				{
					class_name: "FedRampDO",
					image_uri: "registry.fed.cloudflare.com/fedramp:latest",
					image_tag: "registry.fed.cloudflare.com/fedramp:latest",
				},
			],
			settings: {
				accountId: "fedramp-account",
				complianceRegion: "fedramp-high",
			},
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

	test("prepares the sidecar for an image-free Container without registry credentials", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", undefined);
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);

		await prepareContainerImagesForVite({
			dockerPath: "test-docker",
			containerOptions: [],
			settings: {},
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
});
