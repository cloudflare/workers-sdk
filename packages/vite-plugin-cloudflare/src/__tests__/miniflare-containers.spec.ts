import { InputWorkerSchema } from "@cloudflare/config";
import { describe, test } from "vitest";
import { createMiniflareExports } from "../miniflare-options";

describe("Container Miniflare exports", () => {
	test("replaces Container names with runtime image metadata", ({ expect }) => {
		const worker = InputWorkerSchema.parse({
			name: "worker",
			compatibilityDate: "2024-12-30",
			exports: {
				ContainerDO: {
					type: "durable-object",
					storage: "sqlite",
					container: "api",
				},
				RegularDO: {
					type: "durable-object",
					storage: "sqlite",
				},
			},
		});

		const exports = createMiniflareExports({
			exports: worker.exports,
			containerRuntimeOptions: new Map([
				["ContainerDO", { imageName: "cloudflare-dev/containerdo:123" }],
			]),
		});

		expect(exports).toEqual({
			ContainerDO: {
				type: "durable-object",
				storage: "sqlite",
				container: { imageName: "cloudflare-dev/containerdo:123" },
			},
			RegularDO: {
				type: "durable-object",
				storage: "sqlite",
				container: undefined,
			},
		});
	});

	test("rejects Container exports without a runtime plan", ({ expect }) => {
		expect(() =>
			createMiniflareExports({
				exports: {
					ContainerDO: {
						type: "durable-object",
						storage: "sqlite",
						container: "missing",
					},
				},
				containerRuntimeOptions: undefined,
			})
		).toThrow("Expected runtime options");
	});
});
