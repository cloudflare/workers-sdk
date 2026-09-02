import { describe, it } from "vitest";
import { getContainerMetadata } from "../src/deploy/helpers/container-metadata";
import type { Config } from "@cloudflare/workers-utils";

describe("getContainerMetadata", () => {
	it("returns undefined when container configuration is absent", ({
		expect,
	}) => {
		expect(getContainerMetadata({} as Config)).toBeUndefined();
	});

	it("returns an empty list when container configuration is explicitly empty", ({
		expect,
	}) => {
		expect(
			getContainerMetadata({ containers: [] } as unknown as Config)
		).toEqual([]);
	});

	it("includes the resolved name when no Durable Object-managed images are configured", ({
		expect,
	}) => {
		const metadata = getContainerMetadata({
			containers: [
				{
					class_name: "Sandbox",
					name: "sandbox-app",
					scheduling_policy: "durable_object",
				},
			],
		} as unknown as Config);

		expect(metadata).toEqual([{ name: "sandbox-app", class_name: "Sandbox" }]);
	});

	it("includes prepared named images for Durable Object-managed containers", ({
		expect,
	}) => {
		const metadata = getContainerMetadata(
			{
				containers: [
					{
						class_name: "Sandbox",
						name: "sandbox-app",
						scheduling_policy: "durable_object",
						images: {
							sandbox: { dockerfile: "./container/Dockerfile" },
						},
					},
				],
			} as unknown as Config,
			{
				Sandbox: {
					sandbox:
						"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
			}
		);

		expect(metadata).toEqual([
			{
				name: "sandbox-app",
				class_name: "Sandbox",
				images: {
					sandbox:
						"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
			},
		]);
	});

	it("keeps Durable Object metadata without images when preparation is skipped", ({
		expect,
	}) => {
		const metadata = getContainerMetadata(
			{
				containers: [
					{
						class_name: "Sandbox",
						name: "sandbox-app",
						scheduling_policy: "durable_object",
						images: {
							sandbox: { dockerfile: "./container/Dockerfile" },
						},
					},
				],
			} as unknown as Config,
			{},
			{ allowUnprepared: true }
		);

		expect(metadata).toEqual([
			{
				name: "sandbox-app",
				class_name: "Sandbox",
			},
		]);
	});
});
