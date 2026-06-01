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

	test("denies access to .npmrc", async ({ expect }) => {
		const response = await getResponse("/.npmrc");
		expect(response.status()).toBe(403);
	});

	test("denies access to .yarnrc", async ({ expect }) => {
		const response = await getResponse("/.yarnrc");
		expect(response.status()).toBe(403);
	});

	test("denies access to .yarnrc.yml", async ({ expect }) => {
		const response = await getResponse("/.yarnrc.yml");
		expect(response.status()).toBe(403);
	});

	test("denies access to .key files", async ({ expect }) => {
		const response = await getResponse("/client.key");
		expect(response.status()).toBe(403);
	});

	test("denies access to .pfx files", async ({ expect }) => {
		const response = await getResponse("/client.pfx");
		expect(response.status()).toBe(403);
	});

	test("denies access to .p12 files", async ({ expect }) => {
		const response = await getResponse("/client.p12");
		expect(response.status()).toBe(403);
	});

	test("denies access to .p8 files", async ({ expect }) => {
		const response = await getResponse("/client.p8");
		expect(response.status()).toBe(403);
	});

	test("denies access to .jks files", async ({ expect }) => {
		const response = await getResponse("/client.jks");
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

	test("doesn't serve .npmrc", async ({ expect }) => {
		const response = await getTextResponse("/.npmrc");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .yarnrc", async ({ expect }) => {
		const response = await getTextResponse("/.yarnrc");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .yarnrc.yml", async ({ expect }) => {
		const response = await getTextResponse("/.yarnrc.yml");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .key files", async ({ expect }) => {
		const response = await getTextResponse("/client.key");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .pfx files", async ({ expect }) => {
		const response = await getTextResponse("/client.pfx");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .p12 files", async ({ expect }) => {
		const response = await getTextResponse("/client.p12");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .p8 files", async ({ expect }) => {
		const response = await getTextResponse("/client.p8");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .jks files", async ({ expect }) => {
		const response = await getTextResponse("/client.jks");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve custom-sensitive-file", async ({ expect }) => {
		const response = await getTextResponse("/custom-sensitive-file");
		expect(response).toBe("Worker A response");
	});
});
