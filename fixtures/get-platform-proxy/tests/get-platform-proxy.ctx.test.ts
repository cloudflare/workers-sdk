import { describe, it } from "vitest";
import { getPlatformProxy } from "./shared";

describe("getPlatformProxy - ctx", () => {
	it("should provide a no-op waitUntil method", async ({ expect }) => {
		const { ctx, dispose } = await getPlatformProxy();
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

	it("should provide a no-op passThroughOnException method", async ({
		expect,
	}) => {
		const { ctx, dispose } = await getPlatformProxy();
		try {
			expect(ctx.passThroughOnException()).toBe(undefined);
		} finally {
			await dispose();
		}
	});

	it("should match the production runtime ctx object", async ({ expect }) => {
		const { ctx, dispose } = await getPlatformProxy();
		try {
			expect(ctx.constructor.name).toBe("ExecutionContext");
			expect(typeof ctx.waitUntil).toBe("function");
			expect(typeof ctx.passThroughOnException).toBe("function");
			expect(ctx.props).toEqual({});

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

	describe("detached methods should behave like workerd", () => {
		it("destructured methods should throw illegal invocation errors", async ({
			expect,
		}) => {
			const {
				ctx: { waitUntil, passThroughOnException },
				dispose,
			} = await getPlatformProxy();
			try {
				expect(() => {
					waitUntil(new Promise(() => {}));
				}).toThrowError("Illegal invocation");

				expect(() => {
					passThroughOnException();
				}).toThrowError("Illegal invocation");
			} finally {
				await dispose();
			}
		});

		it("extracted methods should throw illegal invocation errors", async ({
			expect,
		}) => {
			const { ctx, dispose } = await getPlatformProxy();
			const waitUntil = ctx.waitUntil;
			const passThroughOnException = ctx.passThroughOnException;

			try {
				expect(() => {
					waitUntil(new Promise(() => {}));
				}).toThrowError("Illegal invocation");

				expect(() => {
					passThroughOnException();
				}).toThrowError("Illegal invocation");
			} finally {
				await dispose();
			}
		});

		it("extracted methods which correctly bind this should not throw illegal invocation errors", async ({
			expect,
		}) => {
			const { ctx, dispose } = await getPlatformProxy();
			const waitUntil = ctx.waitUntil.bind(ctx);
			const passThroughOnException = ctx.passThroughOnException;

			try {
				expect(() => {
					waitUntil(new Promise(() => {}));
				}).not.toThrowError("Illegal invocation");

				expect(() => {
					passThroughOnException.apply(ctx, []);
				}).not.toThrowError("Illegal invocation");

				expect(() => {
					passThroughOnException.call(ctx);
				}).not.toThrowError("Illegal invocation");
			} finally {
				await dispose();
			}
		});

		it("extracted methods which incorrectly bind this should throw illegal invocation errors", async ({
			expect,
		}) => {
			const { ctx, dispose } = await getPlatformProxy();
			const waitUntil = ctx.waitUntil.bind({});
			const passThroughOnException = ctx.passThroughOnException;

			try {
				expect(() => {
					waitUntil(new Promise(() => {}));
				}).toThrowError("Illegal invocation");

				expect(() => {
					passThroughOnException.apply(5, []);
				}).toThrowError("Illegal invocation");

				expect(() => {
					passThroughOnException.call(new Boolean());
				}).toThrowError("Illegal invocation");
			} finally {
				await dispose();
			}
		});
	});
});
