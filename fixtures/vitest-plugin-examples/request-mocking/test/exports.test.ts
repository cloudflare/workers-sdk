// Exercises the "integration-self" worker invocation pattern:
// `exports.default.fetch(...)`, which dispatches each call into a fresh
// request I/O context separate from the runner DO context where
// `setupNetwork()` was enabled in `beforeAll`.
import { exports } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { it } from "vitest";
import { network } from "./server";

it("mocks GET requests via exports.default.fetch", async ({ expect }) => {
	network.use(
		http.get("https://cloudflare.com/exports", () => {
			return HttpResponse.text("🟢");
		})
	);

	const response = await exports.default.fetch("https://example.com/exports");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("🟢");
});

it("mocks POST requests via exports.default.fetch", async ({ expect }) => {
	network.use(
		http.post("https://cloudflare.com/exports", async ({ request }) => {
			const text = await request.text();
			if (text !== "✨") {
				return HttpResponse.text("Bad request body", { status: 400 });
			}
			return HttpResponse.text("✅");
		})
	);

	let response = await exports.default.fetch("https://example.com/exports", {
		method: "POST",
		body: "🙃",
	});
	expect(response.status).toBe(400);
	expect(await response.text()).toBe("Bad request body");

	response = await exports.default.fetch("https://example.com/exports", {
		method: "POST",
		body: "✨",
	});
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("✅");
});
