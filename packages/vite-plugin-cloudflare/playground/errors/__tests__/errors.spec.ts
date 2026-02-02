import { describe, expect, test } from "vitest";
import { isBuild, page, viteTestUrl } from "../../__test-utils__";

export const browserMode = true;

describe.runIf(!isBuild)(
	"error thrown in the default export of the entry Worker",
	async () => {
		test("displays the correct message", async () => {
			await page.goto(`${viteTestUrl}/default-export`);
			const errorOverlay = page.locator("vite-error-overlay");
			const message = await errorOverlay
				.locator(".message-body")
				.first()
				.textContent();
			expect(message).toMatch("a is not defined");
		});

		test("displays the correct source link in the stack trace", async () => {
			await page.goto(`${viteTestUrl}/default-export`);
			const errorOverlay = page.locator("vite-error-overlay");
			const stack = errorOverlay.locator(".stack");
			const fileLink = await stack.locator(".file-link").first().textContent();
			expect(fileLink).toMatch(/\/errors\/src\/worker-a\/index.ts:24:17$/);
		});
	}
);

describe.runIf(!isBuild)(
	"error thrown in a named entrypoint of the entry Worker",
	async () => {
		test("displays the correct message", async () => {
			await page.goto(`${viteTestUrl}/named-entrypoint`);
			const errorOverlay = page.locator("vite-error-overlay");
			const message = await errorOverlay
				.locator(".message-body")
				.first()
				.textContent();
			expect(message).toMatch("b is not defined");
		});

		test("displays the correct source link in the stack trace", async () => {
			await page.goto(`${viteTestUrl}/named-entrypoint`);
			const errorOverlay = page.locator("vite-error-overlay");
			const stack = errorOverlay.locator(".stack");
			const fileLink = await stack.locator(".file-link").first().textContent();
			expect(fileLink).toMatch(/\/errors\/src\/worker-a\/index.ts:30:22$/);
		});
	}
);

describe.runIf(!isBuild)(
	"error thrown in the default export of an auxiliary Worker",
	async () => {
		test("displays the correct message", async () => {
			await page.goto(`${viteTestUrl}/auxiliary-worker/default-export`);
			const errorOverlay = page.locator("vite-error-overlay");
			const message = await errorOverlay
				.locator(".message-body")
				.first()
				.textContent();
			expect(message).toMatch("c is not defined");
		});

		test("displays the correct source link in the stack trace", async () => {
			await page.goto(`${viteTestUrl}/auxiliary-worker/default-export`);
			const errorOverlay = page.locator("vite-error-overlay");
			const stack = errorOverlay.locator(".stack");
			const fileLink = await stack.locator(".file-link").first().textContent();
			expect(fileLink).toMatch(/\/errors\/src\/worker-a\/index.ts:36:22$/);
		});
	}
);

describe.runIf(!isBuild)(
	"error thrown in a named entrypoint of an auxiliary Worker",
	async () => {
		test("displays the correct message", async () => {
			await page.goto(`${viteTestUrl}/auxiliary-worker/named-entrypoint`);
			const errorOverlay = page.locator("vite-error-overlay");
			const message = await errorOverlay
				.locator(".message-body")
				.first()
				.textContent();
			expect(message).toMatch("d is not defined");
		});

		test("displays the correct source link in the stack trace", async () => {
			await page.goto(`${viteTestUrl}/auxiliary-worker/named-entrypoint`);
			const errorOverlay = page.locator("vite-error-overlay");
			const stack = errorOverlay.locator(".stack");
			const fileLink = await stack.locator(".file-link").first().textContent();
			expect(fileLink).toMatch(/\/errors\/src\/worker-a\/index.ts:42:22$/);
		});
	}
);
