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

	it.for([
		["ai"],
		["assets"],
		["browser"],
		["images"],
		["media"],
		["stream"],
		["version-metadata"],
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
