import { SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { server } from "./server";

it("mocks GET requests", async () => {
	server.use(
		http.get(
			"https://cloudflare.com/once",
			() => {
				return HttpResponse.text("😉");
			},
			{ once: true }
		),
		http.get("https://cloudflare.com/persistent", () => {
			return HttpResponse.text("📌");
		})
	);

	// Host `example.com` will be rewritten to `cloudflare.com` by the Worker
	let response = await SELF.fetch("https://example.com/once");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("😉");

	// Subsequent `fetch()`es fail...
	response = await SELF.fetch("https://example.com/once");
	expect(response.status).toBe(500);
	expect(await response.text()).toMatch("Cannot bypass");

	// ...but calling `.persist()` will match forever, with `.times(n)` matching
	// `n` times
	for (let i = 0; i < 3; i++) {
		response = await SELF.fetch("https://example.com/persistent");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("📌");
	}
});

it("mocks POST requests", async () => {
	server.use(
		http.post("https://cloudflare.com/path", async ({ request }) => {
			const text = await request.text();
			console.log(text);
			if (text !== "✨") {
				return HttpResponse.error();
			}
			return HttpResponse.text("✅");
		})
	);

	// Sending a request without the expected body shouldn't match...
	let response = await SELF.fetch("https://example.com/path", {
		method: "POST",
		body: "🙃",
	});
	expect(response.status).toBe(500);
	expect(await response.text()).toMatch("TypeError: Failed to fetch");

	// ...but the correct body should
	response = await SELF.fetch("https://example.com/path", {
		method: "POST",
		body: "✨",
	});
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("✅");
});
