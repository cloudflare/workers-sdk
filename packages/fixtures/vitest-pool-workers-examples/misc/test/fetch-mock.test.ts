import { fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, expect, it } from "vitest";

beforeAll(() => fetchMock.activate());
afterEach(() => fetchMock.assertNoPendingInterceptors());

it("falls through to global fetch() if unmatched", async () => {
	fetchMock
		.get("https://example.com")
		.intercept({ path: "/" })
		.reply(200, "body");

	let response = await fetch("https://example.com");
	expect(await response.text()).toBe("body");

	response = await fetch("https://example.com/bad");
	expect(await response.text()).toBe("fallthrough:GET https://example.com/bad");
});
