import { describe, it } from "vitest";
import { getStandaloneSupport } from "../../src/config/standalone-support";
import type { Binding } from "../../src/types";

describe("getStandaloneSupport", () => {
	it("reports pure value/config bindings and assets as supported", ({
		expect,
	}) => {
		const supported: Binding["type"][] = [
			"plain_text",
			"secret_text",
			"json",
			"wasm_module",
			"text_blob",
			"data_blob",
			"version_metadata",
			"inherit",
			"assets",
		];
		for (const type of supported) {
			expect(getStandaloneSupport(type), type).toBe("supported");
		}
	});

	it("reports stateful and platform bindings as unsupported", ({ expect }) => {
		const unsupported: Binding["type"][] = [
			"kv_namespace",
			"r2_bucket",
			"d1",
			"queue",
			"durable_object_namespace",
			"workflow",
			"service",
			"dispatch_namespace",
			"hyperdrive",
			"browser",
			"ai",
			"vectorize",
			"send_email",
		];
		for (const type of unsupported) {
			expect(getStandaloneSupport(type), type).toBe("unsupported");
		}
	});

	it("defaults to unsupported for unknown binding types", ({ expect }) => {
		expect(getStandaloneSupport("totally_made_up" as Binding["type"])).toBe(
			"unsupported"
		);
		// `unsafe_*` bindings are not individually enumerated.
		expect(
			getStandaloneSupport("unsafe_some_future_thing" as Binding["type"])
		).toBe("unsupported");
	});
});
