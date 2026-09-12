import fs from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import { createContainerDevOptions } from "../src/dev-options";
import type { ContainerApp, Exports } from "@cloudflare/workers-utils";

function container(props: Partial<ContainerApp>): ContainerApp {
	return { image: "./Dockerfile", ...props };
}

describe("createContainerDevOptions", () => {
	runInTempDir();

	test("creates Dockerfile build options", async ({ expect }) => {
		const dockerfile = path.resolve("Dockerfile");
		await fs.writeFile(dockerfile, "FROM scratch");

		expect(
			createContainerDevOptions({
				containers: [
					container({
						class_name: "Browser",
						image: dockerfile,
						image_vars: { VERSION: "1" },
					}),
				],
				exports: {},
				containerBuildId: "build-123",
				configPath: path.resolve("wrangler.jsonc"),
			})
		).toEqual([
			{
				dockerfile,
				image_build_context: process.cwd(),
				image_vars: { VERSION: "1" },
				class_name: "Browser",
				image_tag: "cloudflare-dev/browser:build-123",
			},
		]);
	});

	test("creates registry pull options from export associations", ({
		expect,
	}) => {
		const exports: Exports = {
			Browser: {
				type: "durable-object",
				storage: "sqlite",
				container: "browser-container",
			},
		};

		expect(
			createContainerDevOptions({
				containers: [
					container({
						name: "browser-container",
						image: "docker.io/example/browser:latest",
					}),
				],
				exports,
				containerBuildId: "build-123",
			})
		).toEqual([
			{
				image_uri: "docker.io/example/browser:latest",
				class_name: "Browser",
				image_tag: "cloudflare-dev/browser:build-123",
			},
		]);
	});

	test("skips Durable Object-managed containers in mixed configurations", ({
		expect,
	}) => {
		expect(
			createContainerDevOptions({
				containers: [
					{
						name: "managed-container",
						class_name: "ManagedDO",
						scheduling_policy: "durable_object",
						images: { app: { dockerfile: "./Dockerfile" } },
					},
					container({
						class_name: "Browser",
						image: "docker.io/example/browser:latest",
					}),
				],
				exports: {},
				containerBuildId: "build-123",
			})
		).toEqual([
			{
				image_uri: "docker.io/example/browser:latest",
				class_name: "Browser",
				image_tag: "cloudflare-dev/browser:build-123",
			},
		]);
	});
});
