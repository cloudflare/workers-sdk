import { isDockerfile } from "@cloudflare/containers-shared";
import { vi } from "vitest";
import { getNormalizedContainerOptions } from "../../containers/config";
import { UserError } from "../../errors";
import type { Config } from "../../config";

// Mock dependencies using vi.hoisted
vi.mock("@cloudflare/containers-shared");

const mockIsDockerfile = vi.mocked(isDockerfile);

describe("getNormalizedContainerOptions", () => {
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

		const result = await getNormalizedContainerOptions(config);
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

		const result = await getNormalizedContainerOptions(config);
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
				},
			],
			durable_objects: {
				bindings: [],
			},
		} as Partial<Config> as Config;

		await expect(getNormalizedContainerOptions(config)).rejects.toThrow(
			UserError
		);
		await expect(getNormalizedContainerOptions(config)).rejects.toThrow(
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
		} as Partial<Config> as Config;

		await expect(getNormalizedContainerOptions(config)).rejects.toThrow(
			UserError
		);
		await expect(getNormalizedContainerOptions(config)).rejects.toThrow(
			"The container class_name TestContainer does not match any durable object class_name defined in your Wrangler config file"
		);
	});

	it("should normalize and set defaults for container with dockerfile", async () => {
		mockIsDockerfile.mockReturnValue(true);

		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: "./Dockerfile",
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

		const result = await getNormalizedContainerOptions(config);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			name: "test-worker-testcontainer",
			class_name: "TestContainer",
			max_instances: 0,
			scheduling_policy: "default",
			rollout_step_percentage: 25,
			rollout_kind: "full_auto",
			instance_type: "dev",
			dockerfile: "/test/Dockerfile",
			image_build_context: "/test",
			image_vars: undefined,
			constraints: undefined,
		});
	});

	it("should normalize and set defaults for container with registry image", async () => {
		mockIsDockerfile.mockReturnValue(false);

		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: "registry.example.com/test:latest",
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

		const result = await getNormalizedContainerOptions(config);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			name: "test-worker-testcontainer",
			class_name: "TestContainer",
			max_instances: 0,
			scheduling_policy: "default",
			rollout_step_percentage: 25,
			rollout_kind: "full_auto",
			instance_type: "dev",
			registry_link: "registry.example.com/test:latest",
			constraints: undefined,
		});
	});

	it("should use provided container name when specified", async () => {
		mockIsDockerfile.mockReturnValue(false);

		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					name: "custom-container-name",
					class_name: "TestContainer",
					image: "registry.example.com/test:latest",
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

		const result = await getNormalizedContainerOptions(config);

		expect(result[0].name).toBe("custom-container-name");
	});

	it("should handle (deprecated) disk size configuration", async () => {
		mockIsDockerfile.mockReturnValue(false);

		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: "registry.example.com/test:latest",
					configuration: {
						disk: { size: "5GiB" },
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
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config);

		expect(result[0]).toEqual({
			name: "test-worker-testcontainer",
			class_name: "TestContainer",
			max_instances: 0,
			scheduling_policy: "default",
			rollout_step_percentage: 25,
			rollout_kind: "full_auto",
			disk_size: 5368709120,
			registry_link: "registry.example.com/test:latest",
			constraints: undefined,
		});
	});

	it("should handle instance type configuration", async () => {
		mockIsDockerfile.mockReturnValue(false);

		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: "registry.example.com/test:latest",
					instance_type: "standard",
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

		const result = await getNormalizedContainerOptions(config);

		expect(result[0]).toEqual({
			name: "test-worker-testcontainer",
			class_name: "TestContainer",
			max_instances: 0,
			scheduling_policy: "default",
			rollout_step_percentage: 25,
			rollout_kind: "full_auto",
			instance_type: "standard",
			registry_link: "registry.example.com/test:latest",
			constraints: undefined,
		});
	});

	it("should handle all custom configuration options", async () => {
		mockIsDockerfile.mockReturnValue(false);

		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					name: "custom-name",
					class_name: "TestContainer",
					image: "registry.example.com/test:latest",
					max_instances: 10,
					scheduling_policy: "regional",
					rollout_step_percentage: 50,
					rollout_kind: "full_manual",
					instance_type: "basic",
					constraints: {
						regions: ["us-east-1", "us-west-2"],
						cities: ["NYC", "SF"],
						tier: 1,
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
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config);

		expect(result[0]).toEqual({
			name: "custom-name",
			class_name: "TestContainer",
			max_instances: 10,
			scheduling_policy: "regional",
			rollout_step_percentage: 50,
			rollout_kind: "full_manual",
			instance_type: "basic",
			registry_link: "registry.example.com/test:latest",
			constraints: {
				regions: ["us-east-1", "us-west-2"],
				cities: ["NYC", "SF"],
				tier: 1,
			},
		});
	});

	it("should handle dockerfile with default build context", async () => {
		mockIsDockerfile.mockReturnValue(true);

		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: "./path/to/Dockerfile",
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

		const result = await getNormalizedContainerOptions(config);

		expect(result[0]).toEqual({
			name: "test-worker-testcontainer",
			class_name: "TestContainer",
			max_instances: 0,
			scheduling_policy: "default",
			rollout_step_percentage: 25,
			rollout_kind: "full_auto",
			instance_type: "dev",
			dockerfile: "/test/path/to/Dockerfile",
			image_build_context: "/test/path/to",
			image_vars: undefined,
			constraints: undefined,
		});
	});

	it("should handle multiple containers", async () => {
		mockIsDockerfile.mockReturnValue(false);

		const config: Config = {
			name: "test-worker",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "Container1",
					image: "registry.example.com/test1:latest",
				},
				{
					class_name: "Container2",
					image: "registry.example.com/test2:latest",
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
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config);

		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("test-worker-container1");
		expect(result[0].class_name).toBe("Container1");
		expect(result[1].name).toBe("test-worker-container2");
		expect(result[1].class_name).toBe("Container2");
	});

	it("should handle config with no configPath", async () => {
		mockIsDockerfile.mockReturnValue(true);

		const config: Config = {
			name: "test-worker",
			configPath: undefined,
			userConfigPath: undefined,
			topLevelName: "test-worker",
			containers: [
				{
					class_name: "TestContainer",
					image: "./Dockerfile",
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

		const result = await getNormalizedContainerOptions(config);

		// Check that it has dockerfile properties (not registry_link)
		expect(result[0]).toHaveProperty("dockerfile");
		expect(result[0]).toHaveProperty("image_build_context");
		expect(result[0]).not.toHaveProperty("registry_link");
	});

	it("should replace spaces with dashes in generated name", async () => {
		mockIsDockerfile.mockReturnValue(false);

		const config: Config = {
			name: "test worker with spaces",
			configPath: "/test/wrangler.toml",
			userConfigPath: "/test/wrangler.toml",
			topLevelName: "test worker with spaces",
			containers: [
				{
					class_name: "Test Container",
					image: "registry.example.com/test:latest",
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "TEST_DO",
						class_name: "Test Container",
					},
				],
			},
		} as Partial<Config> as Config;

		const result = await getNormalizedContainerOptions(config);

		expect(result[0].name).toBe("test-worker-with-spaces-test-container");
	});
});
