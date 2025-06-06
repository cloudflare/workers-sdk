import { describe, expect, test } from "vitest";
import { getResponse } from "../../__test-utils__";

test("denies access to .dev.vars", async () => {
	const response = await getResponse("/.dev.vars");
	expect(response.status()).toBe(403);
});

test("denies access to .dev.vars.*", async () => {
	const response = await getResponse("/.dev.vars");
	expect(response.status()).toBe(403);
});

test("denies access to .env", async () => {
	const response = await getResponse("/.env");
	expect(response.status()).toBe(403);
});

test("denies access to .env.*", async () => {
	const response = await getResponse("/.env.with-specified-env");
	expect(response.status()).toBe(403);
});
