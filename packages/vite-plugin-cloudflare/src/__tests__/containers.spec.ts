import { execFileSync } from "node:child_process";
import { OpenAPI } from "@cloudflare/containers-shared";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import {
	configureContainerPull,
	getContainerOptions,
	selectViteContainerEngine,
} from "../containers";
import type { ResolvedWorkerConfig } from "../plugin-config";

type Containers = ResolvedWorkerConfig["containers"];
type Exports = ResolvedWorkerConfig["exports"];

function containerWorker(
	name: string,
	containerEngine?: ResolvedWorkerConfig["dev"]["container_engine"],
	enableContainers = true
) {
	return {
		config: {
			name,
			containers: enableContainers
				? [{ name: "container", image: "docker.io/example/image:latest" }]
				: undefined,
			dev: {
				enable_containers: enableContainers,
				container_engine: containerEngine,
			},
		},
	};
}

vi.mock("node:child_process");

describe("getContainerOptions", () => {
	test("returns undefined when no containers are configured", ({ expect }) => {
		expect(
			getContainerOptions({
				containersConfig: undefined,
				exports: {},
				containerBuildId: "build-id",
			})
		).toBeUndefined();
	});

	test("uses the container's own class_name when set", ({ expect }) => {
		const containersConfig: Containers = [
			{
				name: "my-container",
				class_name: "MyDO",
				image: "registry.cloudflare.com/hello:world",
			},
		];

		expect(
			getContainerOptions({
				containersConfig,
				exports: {},
				containerBuildId: "build-id",
			})
		).toEqual([
			{
				image_uri: "registry.cloudflare.com/hello:world",
				class_name: "MyDO",
				image_tag: "cloudflare-dev/mydo:build-id",
			},
		]);
	});

	test("resolves class_name from a durable object export that references the container", ({
		expect,
	}) => {
		const containersConfig: Containers = [
			{ name: "my-container", image: "registry.cloudflare.com/hello:world" },
		];
		const exports: Exports = {
			MyContainerDO: {
				type: "durable-object",
				storage: "sqlite",
				container: "my-container",
			},
		};

		expect(
			getContainerOptions({
				containersConfig,
				exports,
				containerBuildId: "build-id",
			})
		).toEqual([
			{
				image_uri: "registry.cloudflare.com/hello:world",
				class_name: "MyContainerDO",
				image_tag: "cloudflare-dev/mycontainerdo:build-id",
			},
		]);
	});

	test("skips containers that are not linked to a durable object", ({
		expect,
	}) => {
		const containersConfig: Containers = [
			{ name: "linked", image: "registry.cloudflare.com/hello:world" },
			{ name: "unlinked", image: "registry.cloudflare.com/goodbye:world" },
		];
		const exports: Exports = {
			MyContainerDO: {
				type: "durable-object",
				storage: "sqlite",
				container: "linked",
			},
		};

		expect(
			getContainerOptions({
				containersConfig,
				exports,
				containerBuildId: "build-id",
			})
		).toEqual([
			{
				image_uri: "registry.cloudflare.com/hello:world",
				class_name: "MyContainerDO",
				image_tag: "cloudflare-dev/mycontainerdo:build-id",
			},
		]);
	});

	// Config validation rejects a container that is linked to nothing, so this is
	// only reachable defensively. `undefined` and `[]` both mean there is nothing
	// to build or pull, and both call sites iterate `options ?? []`.
	test("returns an empty array when no container is linked to a durable object", ({
		expect,
	}) => {
		const containersConfig: Containers = [
			{ name: "my-container", image: "registry.cloudflare.com/hello:world" },
		];

		expect(
			getContainerOptions({
				containersConfig,
				exports: {},
				containerBuildId: "build-id",
			})
		).toEqual([]);
	});
});

describe("Vite container engine selection", () => {
	beforeEach(() => {
		vi.stubEnv("WRANGLER_DOCKER_HOST", undefined);
		vi.stubEnv("DOCKER_HOST", undefined);
		vi.mocked(execFileSync).mockReset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("uses the resolved Docker host by default", ({ expect }) => {
		vi.stubEnv("WRANGLER_DOCKER_HOST", "unix:///wrangler/docker.sock");

		expect(
			selectViteContainerEngine([containerWorker("worker")], "docker")
		).toBe("unix:///wrangler/docker.sock");
	});

	test("uses an explicit string engine without inspecting Docker contexts", ({
		expect,
	}) => {
		expect(
			selectViteContainerEngine(
				[
					containerWorker("inactive-worker", undefined, false),
					containerWorker("worker", "unix:///custom/docker.sock"),
				],
				"docker"
			)
		).toBe("unix:///custom/docker.sock");
		expect(execFileSync).not.toHaveBeenCalled();
	});

	test("uses the endpoint from an explicit local Docker engine", ({
		expect,
	}) => {
		const containerEngine = {
			localDocker: {
				socketPath: "unix:///custom/docker.sock",
				containerEgressInterceptorImage: "custom-egress",
			},
		};

		expect(
			selectViteContainerEngine(
				[
					containerWorker("worker", containerEngine),
					containerWorker("second-worker", "unix:///custom/docker.sock"),
				],
				"docker"
			)
		).toBe(containerEngine);
		expect(execFileSync).not.toHaveBeenCalled();
	});

	test("rejects conflicting endpoints across Workers", ({ expect }) => {
		expect(() =>
			selectViteContainerEngine(
				[
					containerWorker("first-worker", "unix:///first.sock"),
					containerWorker("second-worker", "unix:///second.sock"),
				],
				"docker"
			)
		).toThrow(/must use the same dev\.container_engine/);
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
