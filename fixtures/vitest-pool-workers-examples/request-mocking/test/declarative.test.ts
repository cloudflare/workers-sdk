import { exports } from "cloudflare:workers";
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
	let response = await exports.default.fetch("https://example.com/once");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("😉");

	// Subsequent `fetch()`es fail...
	response = await exports.default.fetch("https://example.com/once");
	expect(response.status).toBe(500);
	expect(await response.text()).toMatch("Cannot bypass");

	// ...but calling `.persist()` will match forever, with `.times(n)` matching
	// `n` times
	for (let i = 0; i < 3; i++) {
		response = await exports.default.fetch("https://example.com/persistent");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("📌");
	}
});

it("mocks POST requests", async () => {
	server.use(
		http.post("https://cloudflare.com/path", async ({ request }) => {
			const text = await request.text();
			if (text !== "✨") {
				return HttpResponse.text("Bad request body", { status: 400 });
			}
			return HttpResponse.text("✅");
		})
	);

	// Sending a request without the expected body returns an error response...
	let response = await exports.default.fetch("https://example.com/path", {
		method: "POST",
		body: "🙃",
	});
	expect(response.status).toBe(400);
	expect(await response.text()).toBe("Bad request body");

	// ...but the correct body should succeed
	response = await exports.default.fetch("https://example.com/path", {
		method: "POST",
		body: "✨",
	});
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("✅");
});
