import { describe, it } from "vitest";
import { pickRemoteBindings } from "../src/index";
import type { Binding } from "../src/index";

describe("pickRemoteBindings", () => {
	it("returns empty record for empty input", ({ expect }) => {
		expect(pickRemoteBindings({})).toEqual({});
	});

	it("filters out local-only bindings", ({ expect }) => {
		const bindings: Record<string, Binding> = {
			MY_KV: { type: "kv_namespace", id: "abc123" },
			MY_VAR: { type: "plain_text", value: "hello" },
		};
		expect(pickRemoteBindings(bindings)).toEqual({});
	});

	it("includes bindings with remote: true", ({ expect }) => {
		const bindings: Record<string, Binding> = {
			MY_KV: { type: "kv_namespace", id: "abc123", remote: true },
			LOCAL_KV: { type: "kv_namespace", id: "def456" },
		};
		const result = pickRemoteBindings(bindings);
		expect(Object.keys(result)).toEqual(["MY_KV"]);
	});

	it("always includes bindings with no local simulator", ({ expect }) => {
		const bindings: Record<string, Binding> = {
			MY_AI: { type: "ai" },
		};
		const result = pickRemoteBindings(bindings);
		expect(Object.keys(result)).toEqual(["MY_AI"]);
	});

	it("handles a mix of remote and local bindings", ({ expect }) => {
		const bindings: Record<string, Binding> = {
			REMOTE_R2: { type: "r2_bucket", bucket_name: "my-bucket", remote: true },
			LOCAL_D1: { type: "d1", database_id: "db-123" },
			ALWAYS_AI: { type: "ai" },
			LOCAL_VAR: { type: "plain_text", value: "test" },
		};
		const result = pickRemoteBindings(bindings);
		expect(Object.keys(result).sort()).toEqual(["ALWAYS_AI", "REMOTE_R2"]);
	});
});
