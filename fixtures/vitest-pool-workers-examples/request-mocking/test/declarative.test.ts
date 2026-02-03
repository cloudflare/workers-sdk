import { fetchMock, SELF } from "cloudflare:test";
import { afterEach, beforeAll, it } from "vitest";

beforeAll(() => {
	// Enable outbound request mocking...
	fetchMock.activate();
	// ...and throw errors if an outbound request isn't mocked
	fetchMock.disableNetConnect();
});

// Ensure we matched every mock we defined
afterEach(() => fetchMock.assertNoPendingInterceptors());

it("mocks GET requests", async ({ expect }) => {
	fetchMock
		.get("https://cloudflare.com")
		.intercept({ path: "/once" })
		.reply(200, "😉");
	fetchMock
		.get("https://cloudflare.com")
		.intercept({ path: "/persistent" })
		.reply(200, "📌")
		.persist();

	// Host `example.com` will be rewritten to `cloudflare.com` by the Worker
	let response = await SELF.fetch("https://example.com/once");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("😉");

	// By default, each mock only matches once, so subsequent `fetch()`es fail...
	response = await SELF.fetch("https://example.com/once");
	expect(response.status).toBe(500);
	expect(await response.text()).toMatch("MockNotMatchedError");

	// ...but calling `.persist()` will match forever, with `.times(n)` matching
	// `n` times
	for (let i = 0; i < 3; i++) {
		response = await SELF.fetch("https://example.com/persistent");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("📌");
	}
});

it("mocks POST requests", async ({ expect }) => {
	fetchMock
		.get("https://cloudflare.com")
		.intercept({ method: "POST", path: "/path", body: "✨" })
		.reply(200, "✅");

	// Sending a request without the expected body shouldn't match...
	let response = await SELF.fetch("https://example.com/path", {
		method: "POST",
		body: "🙃",
	});
	expect(response.status).toBe(500);
	expect(await response.text()).toMatch("MockNotMatchedError");

	// ...but the correct body should
	response = await SELF.fetch("https://example.com/path", {
		method: "POST",
		body: "✨",
	});
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("✅");
});
