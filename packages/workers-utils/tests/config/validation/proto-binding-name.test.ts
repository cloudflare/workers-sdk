import { describe, it } from "vitest";
import { normalizeAndValidateConfig } from "../../../src/config/validation";
import type { RawConfig } from "../../../src/config";

// https://github.com/cloudflare/workers-sdk/issues/5111
describe("binding names such as `__proto__`", () => {
	it("should not throw for a KV namespace bound as `__proto__`", ({
		expect,
	}) => {
		const raw = {
			kv_namespaces: [{ id: "test-namespace", binding: "__proto__" }],
		} as RawConfig;
		expect(() =>
			normalizeAndValidateConfig(raw, undefined, undefined, { env: undefined })
		).not.toThrow();
	});

	it("should not throw for a var named `__proto__`", ({ expect }) => {
		const raw = JSON.parse(
			'{"vars": {"__proto__": {"evil": true}}}'
		) as RawConfig;
		expect(() =>
			normalizeAndValidateConfig(raw, undefined, undefined, { env: undefined })
		).not.toThrow();
	});
});
