import { describe, expect, test } from "vitest";
import { getResponse, getTextResponse, isBuild } from "../../__test-utils__";

describe.skipIf(isBuild)("denies access to sensitive files in dev", () => {
	test("denies access to .env", async () => {
		const response = await getResponse("/.env");
		expect(response.status).toBe(403);
	});

	test("denies access to .env.*", async () => {
		const response = await getResponse("/.env.staging");
		expect(response.status).toBe(403);
	});

	test("denies access to .dev.vars", async () => {
		const response = await getResponse("/.dev.vars");
		expect(response.status).toBe(403);
	});

	test("denies access to .dev.vars.*", async () => {
		const response = await getResponse("/.dev.vars.staging");
		expect(response.status).toBe(403);
	});

	test("denies access to .dev.vars in subdirectory", async () => {
		const response = await getResponse("/worker-b/.dev.vars");
		expect(response.status).toBe(403);
	});

	test("denies access to .dev.vars.* in subdirectory", async () => {
		const response = await getResponse("/worker-b/.dev.vars.staging");
		expect(response.status).toBe(403);
	});

	test("denies access to custom-sensitive-file", async () => {
		const response = await getResponse("/custom-sensitive-file");
		expect(response.status).toBe(403);
	});
});

describe.runIf(isBuild)("doesn't serve sensitive files in preview", () => {
	test("doesn't serve .env", async () => {
		const response = await getTextResponse("/.env");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .env.*", async () => {
		const response = await getTextResponse("/.env.staging");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .dev.vars", async () => {
		const response = await getTextResponse("/.dev.vars");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve .dev.vars.*", async () => {
		const response = await getTextResponse("/.dev.vars.staging");
		expect(response).toBe("Worker A response");
	});

	test("doesn't serve custom-sensitive-file", async () => {
		const response = await getTextResponse("/custom-sensitive-file");
		expect(response).toBe("Worker A response");
	});
});
