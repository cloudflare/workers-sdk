import { describe, it } from "vitest";
import { ConfigSchema } from "../schema";

describe("env singleton bindings", () => {
	it("accepts undefined env", ({ expect }) => {
		const result = ConfigSchema.safeParse({});

		expect(result.success).toBe(true);
	});

	it("accepts empty env", ({ expect }) => {
		const result = ConfigSchema.safeParse({ env: {} });

		expect(result.success).toBe(true);
	});

	it("accepts a single singleton binding of each type", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			env: {
				MY_AI: { type: "ai" },
				MY_ASSETS: { type: "assets" },
				MY_BROWSER: { type: "browser" },
				MY_IMAGES: { type: "images" },
				MY_MEDIA: { type: "media" },
				MY_STREAM: { type: "stream" },
				MY_VERSION_METADATA: { type: "version-metadata" },
				MY_WEB_SEARCH: { type: "web-search" },
			},
		});

		expect(result.success).toBe(true);
	});

	it("accepts multiple non-singleton bindings of the same type", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({
			env: {
				KV_1: { type: "kv" },
				KV_2: { type: "kv" },
				KV_3: { type: "kv" },
			},
		});

		expect(result.success).toBe(true);
	});

	it("accepts multiple agent-memory bindings", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			env: {
				MEM_1: { type: "agent-memory", namespace: "ns-1" },
				MEM_2: { type: "agent-memory", namespace: "ns-2" },
			},
		});

		expect(result.success).toBe(true);
	});

	it.for([
		["ai"],
		["assets"],
		["browser"],
		["images"],
		["media"],
		["stream"],
		["version-metadata"],
		["web-search"],
	] as const)("rejects two %s bindings", ([type], { expect }) => {
		const result = ConfigSchema.safeParse({
			env: {
				BINDING_1: { type },
				BINDING_2: { type },
			},
		});

		expect(result.success).toBe(false);

		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				`${type} bindings can only be defined once`
			);
		}
	});

	it("rejects multiple duplicate singleton types with 'and' message", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({
			env: {
				AI_1: { type: "ai" },
				AI_2: { type: "ai" },
				ASSETS_1: { type: "assets" },
				ASSETS_2: { type: "assets" },
			},
		});

		expect(result.success).toBe(false);

		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"ai and assets bindings can only be defined once"
			);
		}
	});

	it("rejects three duplicate singleton types with oxford comma", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({
			env: {
				AI_1: { type: "ai" },
				AI_2: { type: "ai" },
				ASSETS_1: { type: "assets" },
				ASSETS_2: { type: "assets" },
				BROWSER_1: { type: "browser" },
				BROWSER_2: { type: "browser" },
			},
		});

		expect(result.success).toBe(false);

		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"ai, assets, and browser bindings can only be defined once"
			);
		}
	});

	it("lists duplicates alphabetically regardless of input order", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({
			env: {
				STREAM_1: { type: "stream" },
				STREAM_2: { type: "stream" },
				AI_1: { type: "ai" },
				AI_2: { type: "ai" },
			},
		});

		expect(result.success).toBe(false);

		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"ai and stream bindings can only be defined once"
			);
		}
	});

	it("ignores non-singleton duplicates when reporting", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			env: {
				AI_1: { type: "ai" },
				AI_2: { type: "ai" },
				KV_1: { type: "kv" },
				KV_2: { type: "kv" },
			},
		});

		expect(result.success).toBe(false);

		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"ai bindings can only be defined once"
			);
		}
	});
});

describe("entrypoint", () => {
	it("accepts a string entrypoint and passes it through unchanged", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({ entrypoint: "./src/index.ts" });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.entrypoint).toBe("./src/index.ts");
		}
	});

	it("accepts a namespace-like object and collapses it to the default export string", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({
			entrypoint: { default: "./src/index.ts" },
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.entrypoint).toBe("./src/index.ts");
		}
	});

	it("rejects a namespace object whose default is not a string", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({
			entrypoint: { default: 123 },
		});

		expect(result.success).toBe(false);
	});

	it("rejects a namespace object missing a default export", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			entrypoint: { other: "value" },
		});

		expect(result.success).toBe(false);
	});

	it("accepts an undefined entrypoint", ({ expect }) => {
		const result = ConfigSchema.safeParse({});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.entrypoint).toBeUndefined();
		}
	});
});

describe("unknown property rejection", () => {
	it("rejects unknown top-level keys (typo)", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			name: "w",
			// Typo: should be `compatibilityDate`
			compatibilityDates: "2025-01-01",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find(
				(i) => i.code === "unrecognized_keys"
			);
			expect(issue).toBeDefined();
			expect(issue?.path).toEqual([]);
			expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
				"compatibilityDates"
			);
		}
	});

	it("rejects unknown keys inside `assets`", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			assets: {
				// Typo: should be `htmlHandling`
				htmlHnadling: "none",
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find(
				(i) => i.code === "unrecognized_keys"
			);
			expect(issue).toBeDefined();
			expect(issue?.path).toEqual(["assets"]);
			expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
				"htmlHnadling"
			);
		}
	});

	it("rejects unknown keys inside a binding", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			env: {
				MY_KV: {
					type: "kv",
					// Typo: should be `id`
					idd: "abc123",
				},
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find(
				(i) => i.code === "unrecognized_keys"
			);
			expect(issue).toBeDefined();
			expect(issue?.path).toEqual(["env", "MY_KV"]);
			expect((issue as { keys?: string[] } | undefined)?.keys).toContain("idd");
		}
	});

	it("rejects unknown keys inside `observability.logs`", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			observability: {
				logs: {
					enabled: true,
					// Typo: should be `headSamplingRate`
					sampleRate: 0.5,
				},
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find(
				(i) => i.code === "unrecognized_keys"
			);
			expect(issue).toBeDefined();
			expect(issue?.path).toEqual(["observability", "logs"]);
			expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
				"sampleRate"
			);
		}
	});

	it("rejects unknown keys inside a trigger", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			triggers: [
				{
					type: "scheduled",
					schedule: "0 0 * * *",
					// Typo: not a real field
					cronz: "0 0 * * *",
				},
			],
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find(
				(i) => i.code === "unrecognized_keys"
			);
			expect(issue).toBeDefined();
			expect(issue?.path).toEqual(["triggers", 0]);
			expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
				"cronz"
			);
		}
	});

	it("still accepts unknown keys on `unsafe:*` bindings (looseObject escape hatch)", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({
			env: {
				MY_UNSAFE: {
					type: "unsafe:some-future-runtime-feature",
					unknownField: { nested: 123 },
					anotherUnknown: "ok",
				},
			},
		});

		expect(result.success).toBe(true);
	});

	it("passes the `unsafe:*` `type` through unchanged on parse", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({
			env: {
				MY_UNSAFE: {
					type: "unsafe:ratelimit",
					namespace_id: "123",
				},
			},
		});

		expect(result.success).toBe(true);
		if (result.success) {
			const binding = result.data.env?.MY_UNSAFE as {
				type: string;
				namespace_id: string;
			};
			expect(binding.type).toBe("unsafe:ratelimit");
			expect(binding.namespace_id).toBe("123");
		}
	});

	it("rejects `unsafe:` (empty suffix)", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			env: {
				MY_UNSAFE: { type: "unsafe:" },
			},
		});

		expect(result.success).toBe(false);
	});

	it("still accepts arbitrary binding names in `env` (record, not object)", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({
			env: {
				MY_WEIRDLY_NAMED_BINDING_1234: { type: "kv" },
			},
		});

		expect(result.success).toBe(true);
	});
});

describe("vpc-network binding", () => {
	it("accepts a binding with `tunnelId`", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			env: { V: { type: "vpc-network", tunnelId: "tun-1" } },
		});

		expect(result.success).toBe(true);
	});

	it("accepts a binding with `networkId`", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			env: { V: { type: "vpc-network", networkId: "net-1" } },
		});

		expect(result.success).toBe(true);
	});

	it("rejects a binding with neither `tunnelId` nor `networkId`", ({
		expect,
	}) => {
		const result = ConfigSchema.safeParse({
			env: { V: { type: "vpc-network" } },
		});

		expect(result.success).toBe(false);
	});

	it("rejects a binding with both `tunnelId` and `networkId`", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			env: {
				V: { type: "vpc-network", tunnelId: "tun-1", networkId: "net-1" },
			},
		});

		expect(result.success).toBe(false);
	});

	it("rejects unknown keys on a `vpc-network` binding", ({ expect }) => {
		const result = ConfigSchema.safeParse({
			env: {
				V: { type: "vpc-network", tunnelId: "tun-1", unknownField: "x" },
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find(
				(i) => i.code === "unrecognized_keys"
			);
			expect(issue).toBeDefined();
			expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
				"unknownField"
			);
		}
	});
});
