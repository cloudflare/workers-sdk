import { describe, test } from "vitest";
import { getResponse, getTextResponse, isBuild } from "../../__test-utils__";

describe.skipIf(isBuild)("denies access to sensitive files in dev", () => {
	test("denies access to .env", async ({ expect }) => {
		const response = await getResponse("/.env");
		expect(response.status()).toBe(403);
	});

	test("denies access to .env.*", async ({ expect }) => {
		const response = await getResponse("/.env.staging");
		expect(response.status()).toBe(403);
	});

	test("denies access to .dev.vars", async ({ expect }) => {
		const response = await getResponse("/.dev.vars");
		expect(response.status()).toBe(403);
	});

	test("denies access to .dev.vars.*", async ({ expect }) => {
		const response = await getResponse("/.dev.vars.staging");
		expect(response.status()).toBe(403);
	});

	test("denies access to .dev.vars in subdirectory", async ({ expect }) => {
		const response = await getResponse("/worker-b/.dev.vars");
		expect(response.status()).toBe(403);
	});

	test("denies access to .dev.vars.* in subdirectory", async ({ expect }) => {
		const response = await getResponse("/worker-b/.dev.vars.staging");
		expect(response.status()).toBe(403);
	});

	test("denies access to .env in subdirectory", async ({ expect }) => {
		const response = await getResponse("/worker-b/.env");
		expect(response.status()).toBe(403);
	});

	test("denies access to .env.* in subdirectory", async ({ expect }) => {
		const response = await getResponse("/worker-b/.env.staging");
		expect(response.status()).toBe(403);
	});

	test("denies access to root wrangler config", async ({ expect }) => {
		const response = await getResponse("/wrangler.jsonc");
		expect(response.status()).toBe(403);
	});

	test("denies access to auxiliary wrangler config", async ({ expect }) => {
		const response = await getResponse("/worker-b/wrangler.jsonc");
		expect(response.status()).toBe(403);
	});

	test("denies access to vite config", async ({ expect }) => {
		const response = await getResponse("/vite.config.ts");
		expect(response.status()).toBe(403);
	});

	test("denies access to custom-sensitive-file", async ({ expect }) => {
		const response = await getResponse("/custom-sensitive-file");
		expect(response.status()).toBe(403);
	});
});

describe.runIf(isBuild)("doesn't serve sensitive files in preview", () => {
	test("doesn't serve .env", async ({ expect }) => {
		const response = await getTextResponse("/.env");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .env.*", async ({ expect }) => {
		const response = await getTextResponse("/.env.staging");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .dev.vars", async ({ expect }) => {
		const response = await getTextResponse("/.dev.vars");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .dev.vars.*", async ({ expect }) => {
		const response = await getTextResponse("/.dev.vars.staging");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .env in subdirectory", async ({ expect }) => {
		const response = await getTextResponse("/worker-b/.env");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .env.* in subdirectory", async ({ expect }) => {
		const response = await getTextResponse("/worker-b/.env.staging");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve root wrangler config", async ({ expect }) => {
		const response = await getTextResponse("/wrangler.jsonc");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve auxiliary wrangler config", async ({ expect }) => {
		const response = await getTextResponse("/worker-b/wrangler.jsonc");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve vite config", async ({ expect }) => {
		const response = await getTextResponse("/vite.config.ts");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve custom-sensitive-file", async ({ expect }) => {
		const response = await getTextResponse("/custom-sensitive-file");
		expect(response).toBe("Worker A response");
	});
});
