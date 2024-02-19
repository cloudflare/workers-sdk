import { describe, expect, it } from "vitest";
import { getBindingsProxy } from "./shared";

describe("getBindingsProxy - ctx", () => {
	it("should provide a no-op waitUntil method", async () => {
		const { ctx, dispose } = await getBindingsProxy();
		try {
			let value = 4;
			ctx.waitUntil(
				new Promise((resolve) => {
					value++;
					resolve(value);
				})
			);
			expect(value).toBe(5);
		} finally {
			await dispose();
		}
	});

	it("should provide a no-op passThroughOnException method", async () => {
		const { ctx, dispose } = await getBindingsProxy();
		try {
			expect(ctx.passThroughOnException()).toBe(undefined);
		} finally {
			await dispose();
		}
	});

	it("should match the production runtime ctx object", async () => {
		const { ctx, dispose } = await getBindingsProxy();
		try {
			expect(ctx.constructor.name).toBe("ExecutionContext");
			expect(typeof ctx.waitUntil).toBe("function");
			expect(typeof ctx.passThroughOnException).toBe("function");

			ctx.waitUntil = ((str: string) => `- ${str} -`) as any;
			expect(ctx.waitUntil("waitUntil can be overridden" as any)).toBe(
				"- waitUntil can be overridden -"
			);

			ctx.passThroughOnException = ((str: string) => `_ ${str} _`) as any;
			expect(
				(ctx.passThroughOnException as any)(
					"passThroughOnException can be overridden"
				)
			).toBe("_ passThroughOnException can be overridden _");

			(ctx as any).text = "the ExecutionContext can be extended";
			expect((ctx as any).text).toBe("the ExecutionContext can be extended");
		} finally {
			await dispose();
		}
	});
});
