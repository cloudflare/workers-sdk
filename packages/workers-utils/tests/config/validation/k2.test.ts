import { describe, it, vi } from "vitest";
import { convertConfigToBindings } from "../../../src/binding-utils";
import { validateBindingRemoteSetting } from "../../../src/config/binding-local-support";
import { normalizeAndValidateConfig } from "../../../src/config/validation";
import { mapWorkerMetadataBindings } from "../../../src/map-worker-metadata-bindings";
import type { RawConfig } from "../../../src/config";

const stream = "0123456789abcdef0123456789abcdef";
const binding = { binding: "ORDERS", stream, remote: true };

describe("K2 configuration", () => {
	it("normalizes and round-trips the distinct K2 binding kind", ({
		expect,
	}) => {
		const { config, diagnostics } = normalizeAndValidateConfig(
			{ k2: [binding] },
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.errors).toEqual([]);
		expect(config.k2).toEqual([binding]);
		expect(convertConfigToBindings(config).ORDERS).toEqual({
			type: "k2",
			stream,
			remote: true,
		});
		expect(
			mapWorkerMetadataBindings([{ name: "ORDERS", type: "k2", stream }])
		).toEqual({ k2: [{ binding: "ORDERS", stream }] });
	});

	it.for([
		{},
		{ stream },
		{ binding: 42, stream },
		{ binding: "ORDERS" },
		{ binding: "ORDERS", stream: null },
		{ binding: "ORDERS", stream: 42 },
		{ ...binding, remote: "true" },
		null,
		[],
	])("rejects an invalid K2 binding: %j", (value, { expect }) => {
		const { diagnostics } = normalizeAndValidateConfig(
			{ k2: [value] } as unknown as RawConfig,
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.errors.length).toBeGreaterThan(0);
	});

	it("keeps named environments from inheriting the top-level stream", ({
		expect,
	}) => {
		const { config } = normalizeAndValidateConfig(
			{ k2: [binding], env: { staging: {} } },
			undefined,
			undefined,
			{ env: "staging" }
		);
		expect(config.k2).toEqual([]);
	});

	it("rejects binding-name collisions with other resources", ({ expect }) => {
		const { diagnostics } = normalizeAndValidateConfig(
			{ k2: [binding], pipelines: [{ binding: "ORDERS", stream }] },
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.hasErrors()).toBe(true);
	});

	it.for(["stream-v2:orders", ""])(
		"preserves opaque stream IDs in config and previews: %j",
		(streamId, { expect }) => {
			const opaqueBinding = { ...binding, stream: streamId };
			const { config, diagnostics } = normalizeAndValidateConfig(
				{ k2: [opaqueBinding], previews: { k2: [opaqueBinding] } },
				undefined,
				undefined,
				{}
			);
			expect(diagnostics.errors).toEqual([]);
			expect(config.k2).toEqual([opaqueBinding]);
			expect(config.previews?.k2).toEqual([opaqueBinding]);
		}
	);

	it("requires string stream IDs in preview bindings", ({ expect }) => {
		const { diagnostics } = normalizeAndValidateConfig(
			{
				previews: { k2: [{ ...binding, stream: 42 }] },
			} as unknown as RawConfig,
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.hasErrors()).toBe(true);
	});

	it("requires opting in to remote development", ({ expect }) => {
		const warn = vi.fn();
		validateBindingRemoteSetting("k2", undefined, warn);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("remote: true"));
		expect(() => validateBindingRemoteSetting("k2", false, warn)).toThrow(
			"do not support local development"
		);
		expect(() => validateBindingRemoteSetting("k2", true, warn)).not.toThrow();
	});
});
