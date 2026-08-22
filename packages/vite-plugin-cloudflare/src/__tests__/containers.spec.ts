import { OpenAPI } from "@cloudflare/containers-shared";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { configureContainerPull, getContainerOptions } from "../containers";
import type { ResolvedWorkerConfig } from "../plugin-config";

type Containers = ResolvedWorkerConfig["containers"];
type Exports = ResolvedWorkerConfig["exports"];

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
