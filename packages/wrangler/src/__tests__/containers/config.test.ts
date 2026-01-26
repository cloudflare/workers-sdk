import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCloudflareContainerRegistry } from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNormalizedContainerOptions } from "../../containers/config";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { runInTempDir } from "../helpers/run-in-tmp";
import type { Config } from "@cloudflare/workers-utils";

describe("getNormalizedContainerOptions", () => {
	mockApiToken();
	mockAccountId();
	runInTempDir();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return empty array when no containers are configured", async () => {
		const config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [],
			durable_objects: {
				bindings: [],
			},
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toEqual([]);
	});

	it("should return empty array when containers is undefined", async () => {
		const config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: undefined,
			durable_objects: {
				bindings: [],
			},
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toEqual([]);
	});

	it("should throw error when container class_name doesn't match any durable object", async () => {
		const config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: "test-image",
					name: "test-container",
				},
			],
			durable_objects: {
				bindings: [],
			},
		} as Partial<Config> as Config;

		await expect(getNormalizedContainerOptions(config, {})).rejects.toThrow(
			UserError
		);
		await expect(getNormalizedContainerOptions(config, {})).rejects.toThrow(
			"The container class_name TestContainer does not match any durable object class_name defined in your Wrangler config file"
		);
	});

	it("should throw error when durable object has script_name defined", async () => {
		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: "test-image",
					name: "test-container",
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
						script_name: "other-script",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		await expect(getNormalizedContainerOptions(config, {})).rejects.toThrow(
			UserError
		);
		await expect(
			getNormalizedContainerOptions(config, {})
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: The container test-container is referencing the durable object TestContainer, which appears to be defined on the other-script Worker instead (via the 'script_name' field). You cannot configure a container on a Durable Object that is defined in another Worker.]`
		);
	});

	it("should normalize and set defaults for container with dockerfile", async () => {
		writeFileSync("Dockerfile", "FROM scratch");

		const config: Config = {
			name: "test-worker",
			configPath: "./wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: path.resolve("./Dockerfile"),
					name: "test-container",
					max_instances: 3,
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			name: "test-container",
			class_name: "TestContainer",
			max_instances: 3,
			scheduling_policy: "default",
			rollout_step_percentage: [10, 100],
			rollout_kind: "full_auto",
			instance_type: "lite",
			dockerfile: expect.stringMatching(/[/\\]Dockerfile$/),
			image_build_context: expect.stringMatching(/[/\\][^/\\]*$/),
			image_vars: undefined,
			constraints: { tiers: [1, 2] },
			observability: {
				logs_enabled: false,
			},
		});
	});

	it("should normalize and set defaults for container with registry image", async () => {
		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: `${getCloudflareContainerRegistry()}/test:latest`,
					name: "test-container",
					max_instances: 3,
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			name: "test-container",
			class_name: "TestContainer",
			max_instances: 3,
			scheduling_policy: "default",
			rollout_step_percentage: [10, 100],
			rollout_kind: "full_auto",
			instance_type: "lite",
			image_uri: "registry.cloudflare.com/some-account-id/test:latest",
			constraints: { tiers: [1, 2] },
			observability: {
				logs_enabled: false,
			},
		});
	});

	it("should default max_instances and rollout_step_percentage accordingly", async () => {
		writeFileSync("Dockerfile", "FROM scratch");

		const config: Config = {
			name: "test-worker",
			configPath: "./wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: path.resolve("./Dockerfile"),
					name: "test-container",
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			name: "test-container",
			class_name: "TestContainer",
			max_instances: 20,
			rollout_step_percentage: 100,
		});
	});

	it("should handle custom limit configuration", async () => {
		// deprecated path for setting custom limits
		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					name: "test-container",
					class_name: "TestContainer",
					image: "registry.cloudflare.com/test:latest",
					max_instances: 3,
					configuration: {
						disk: { size_mb: 5000 },
						memory_mib: 1024,
						vcpu: 2,
					},
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			name: "test-container",
			class_name: "TestContainer",
			max_instances: 3,
			scheduling_policy: "default",
			rollout_step_percentage: [10, 100],
			rollout_kind: "full_auto",
			disk_bytes: 5_000_000_000, // 5000 MB in bytes
			memory_mib: 1024,
			vcpu: 2,
			image_uri: "registry.cloudflare.com/some-account-id/test:latest",
			constraints: { tiers: [1, 2] },
		});
	});

	it("should handle custom limit configuration through instance_type", async () => {
		// updated path for setting custom limits
		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					name: "test-container",
					class_name: "TestContainer",
					image: "registry.cloudflare.com/test:latest",
					max_instances: 3,
					instance_type: {
						disk_mb: 5000,
						memory_mib: 1024,
						vcpu: 2,
					},
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			name: "test-container",
			class_name: "TestContainer",
			max_instances: 3,
			scheduling_policy: "default",
			rollout_step_percentage: [10, 100],
			rollout_kind: "full_auto",
			disk_bytes: 5_000_000_000, // 5000 MB in bytes
			memory_mib: 1024,
			vcpu: 2,
			image_uri: "registry.cloudflare.com/some-account-id/test:latest",
			constraints: { tiers: [1, 2] },
		});
	});

	it("should normalize and set defaults for custom limits to dev instance type", async () => {
		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					name: "test-container",
					class_name: "TestContainer",
					image: "registry.cloudflare.com/test:latest",
					max_instances: 3,
					instance_type: {
						vcpu: 2,
					},
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			name: "test-container",
			class_name: "TestContainer",
			max_instances: 3,
			scheduling_policy: "default",
			rollout_step_percentage: [10, 100],
			rollout_kind: "full_auto",
			disk_bytes: 2_000_000_000, // 2000 MB in bytes
			memory_mib: 256,
			vcpu: 2,
			image_uri: "registry.cloudflare.com/some-account-id/test:latest",
			constraints: { tiers: [1, 2] },
		});
	});

	it("should handle instance type configuration", async () => {
		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: "registry.cloudflare.com/test:latest",
					instance_type: "standard",
					name: "test-container",
					max_instances: 3,
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			name: "test-container",
			class_name: "TestContainer",
			max_instances: 3,
			scheduling_policy: "default",
			rollout_step_percentage: [10, 100],
			rollout_kind: "full_auto",
			instance_type: "standard",
			image_uri: "registry.cloudflare.com/some-account-id/test:latest",
			constraints: { tiers: [1, 2] },
		});
	});

	it("should handle all custom configuration options", async () => {
		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			observability: {
				logs: { enabled: true },
			},
			containers: [
				{
					name: "custom-name",
					class_name: "TestContainer",
					image: "registry.cloudflare.com/test:latest",
					max_instances: 10,
					scheduling_policy: "regional",
					rollout_step_percentage: 50,
					rollout_kind: "full_manual",
					rollout_active_grace_period: 600,
					instance_type: "basic",
					constraints: {
						tier: 2,
						regions: ["us-east-1", "us-west-2"],
						cities: ["NYC", "SF"],
					},
					affinities: {
						hardware_generation: "highest-overall-performance",
					},
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			name: "custom-name",
			class_name: "TestContainer",
			max_instances: 10,
			scheduling_policy: "regional",
			rollout_step_percentage: 50,
			rollout_kind: "full_manual",
			rollout_active_grace_period: 600,
			instance_type: "basic",
			image_uri: "registry.cloudflare.com/some-account-id/test:latest",
			constraints: {
				tiers: [2],
				regions: ["US-EAST-1", "US-WEST-2"],
				cities: ["nyc", "sf"],
			},
			affinities: {
				hardware_generation: "highest-overall-performance",
			},
			observability: {
				logs_enabled: true,
			},
		});
	});

	it("should handle dockerfile with default build context", async () => {
		mkdirSync("nested", { recursive: true });
		writeFileSync("nested/Dockerfile", "FROM scratch");

		const config: Config = {
			name: "test-worker",
			configPath: "./wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: path.resolve("./nested/Dockerfile"),
					name: "test-container",
					max_instances: 3,
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			name: "test-container",
			class_name: "TestContainer",
			max_instances: 3,
			scheduling_policy: "default",
			rollout_step_percentage: [10, 100],
			rollout_kind: "full_auto",
			instance_type: "lite",
			dockerfile: expect.stringMatching(/[/\\]nested[/\\]Dockerfile$/),
			image_build_context: expect.stringMatching(/[/\\]nested$/),
			image_vars: undefined,
			constraints: { tiers: [1, 2] },
			observability: {
				logs_enabled: false,
			},
		});
	});

	it("should handle multiple containers", async () => {
		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "Container1",
					image: "registry.cloudflare.com/test1:latest",
					name: "test-container",
				},
				{
					class_name: "Container2",
					image: "registry.cloudflare.com/test2:latest",
					name: "test-container-two",
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "DO1",
						class_name: "Container1",
					},
					{
						name: "DO2",
						class_name: "Container2",
					},
				],
			},
			migrations: [
				{ tag: "v1", new_sqlite_classes: ["Container1", "Container2"] },
			],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});

		expect(result).toHaveLength(2);
		expect(result[0].class_name).toBe("Container1");
		expect(result[1].class_name).toBe("Container2");
	});

	it("should handle config with no configPath", async () => {
		writeFileSync("Dockerfile", "FROM scratch");
		const config: Config = {
			name: "test-worker",
			configPath: undefined,
			userConfigPath: undefined,
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: path.resolve("./Dockerfile"),
					name: "test-container",
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toHaveLength(1);
		// Check that it has dockerfile properties (not image_uri)
		expect(result[0]).toHaveProperty("dockerfile");
		expect(result[0]).toHaveProperty("image_build_context");
		expect(result[0]).not.toHaveProperty("image_uri");
	});

	it("should be able to specify all tiers", async () => {
		writeFileSync("Dockerfile", "FROM scratch");
		const config: Config = {
			name: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: `${getCloudflareContainerRegistry()}/test:latest`,
					name: "test-container",
					constraints: {
						tier: -1,
					},
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toHaveLength(1);
		expect(result[0].constraints.tiers).toBeUndefined();
	});

	it("should convert deprecated tier to tiers array", async () => {
		const config: Config = {
			name: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: `${getCloudflareContainerRegistry()}/test:latest`,
					name: "test-container",
					constraints: {
						tier: 3,
					},
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toHaveLength(1);
		expect(result[0].constraints.tiers).toEqual([3]);
	});

	it("should default rollout_step_percentage to 100 when max_instances is 1", async () => {
		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: `${getCloudflareContainerRegistry()}/test:latest`,
					name: "test-container",
					max_instances: 1,
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});
		expect(result).toHaveLength(1);
		expect(result[0].rollout_step_percentage).toBe(100);
	});

	describe("image validation and resolution", async () => {
		it("should allow any image registry", async () => {
			const config: Config = {
				name: "test-worker",
				configPath: "/test/wrangler.toml",
				userConfigPath: "/test/wrangler.toml",
				topLevelName: "test-worker",
				containers: [
					{
						class_name: "TestContainer",
						image: "docker.io/test:latest",
						instance_type: "standard",
						name: "test-container",
						max_instances: 3,
					},
				],
				durable_objects: {
					bindings: [
						{
							name: "TEST_DO",
							class_name: "TestContainer",
						},
					],
				},
				migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
			} as Partial<Config> as Config;
			const result = await getNormalizedContainerOptions(config, {});
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				image_uri: "docker.io/test:latest",
			});
		});
		it("should not try and add an account id to non containers registry uris", async () => {
			const config: Config = {
				name: "test-worker",
				configPath: "/test/wrangler.toml",
				userConfigPath: "/test/wrangler.toml",
				topLevelName: "test-worker",
				containers: [
					{
						class_name: "TestContainer",
						image: "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:blah",
						instance_type: "standard",
						name: "test-container",
						max_instances: 3,
					},
				],
				durable_objects: {
					bindings: [
						{
							name: "TEST_DO",
							class_name: "TestContainer",
						},
					],
				},
				migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
			} as Partial<Config> as Config;
			const result = await getNormalizedContainerOptions(config, {});
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				image_uri: "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:blah",
			});
			vi.unstubAllEnvs();
		});
		it("should not try and add an account id during a dry run", async () => {
			const config: Config = {
				name: "test-worker",
				configPath: "/test/wrangler.toml",
				userConfigPath: "/test/wrangler.toml",
				topLevelName: "test-worker",
				containers: [
					{
						class_name: "TestContainer",
						image: "registry.cloudflare.com/test:latest",
						instance_type: "standard",
						name: "test-container",
						max_instances: 3,
					},
				],
				durable_objects: {
					bindings: [
						{
							name: "TEST_DO",
							class_name: "TestContainer",
						},
					],
				},
				migrations: [{ tag: "v1", new_sqlite_classes: ["TestContainer"] }],
			} as Partial<Config> as Config;
			const result = await getNormalizedContainerOptions(config, {
				dryRun: true,
			});
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				image_uri: "registry.cloudflare.com/test:latest",
			});
		});
	});

	it("should handle valid ssh and authorized_keys config", async () => {
		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: `${getCloudflareContainerRegistry()}/test:latest`,
					name: "test-container",
					max_instances: 3,
					wrangler_ssh: {
						enabled: true,
						port: 22,
					},
					authorized_keys: [
						{
							name: "blahaj",
							public_key:
								"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC0chNcjRotdsxXTwPPNoqVCGn4EcEWdUkkBPNm/v4gm",
						},
					],
					trusted_user_ca_keys: [
						{
							public_key:
								"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC0chNcjRotdsxXTwPPNoqVCGn4EcEWdUkkBPNm/v4gm",
						},
					],
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "TestContainer",
					},
				],
			},
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config, {});

		expect(result).toHaveLength(1);
		expect(result[0].wrangler_ssh).toMatchObject({
			enabled: true,
			port: 22,
		});
		expect(result[0].authorized_keys).toStrictEqual([
			{
				name: "blahaj",
				public_key:
					"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC0chNcjRotdsxXTwPPNoqVCGn4EcEWdUkkBPNm/v4gm",
			},
		]);
	});
});
