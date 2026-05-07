// Exercises the "direct-import" worker invocation pattern:
// `import worker from "../src/index"` followed by `worker.fetch(req, env, ctx)`.
// The worker's `fetch` handler runs in the same I/O context as the test
// runner where `setupNetwork()` was enabled.
//
// For the `exports.default.fetch(...)` counterpart (different request I/O
// context per call) see `exports.test.ts`.
import {
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { it } from "vitest";
import worker from "../src/index";
import { network } from "./server";

it("mocks GET requests", async ({ expect }) => {
	network.use(
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
	let ctx = createExecutionContext();
	let response = await worker.fetch!(
		new Request("https://example.com/once"),
		env,
		ctx
	);
	await waitOnExecutionContext(ctx);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("😉");

	// Persistent handlers match forever
	for (let i = 0; i < 3; i++) {
		ctx = createExecutionContext();
		response = await worker.fetch!(
			new Request("https://example.com/persistent"),
			env,
			ctx
		);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("📌");
	}
});

it("mocks POST requests", async ({ expect }) => {
	network.use(
		http.post("https://cloudflare.com/path", async ({ request }) => {
			const text = await request.text();
			if (text !== "✨") {
				return HttpResponse.text("Bad request body", { status: 400 });
			}
			return HttpResponse.text("✅");
		})
	);

	// Sending a request without the expected body returns an error response...
	let ctx = createExecutionContext();
	let response = await worker.fetch!(
		new Request("https://example.com/path", { method: "POST", body: "🙃" }),
		env,
		ctx
	);
	await waitOnExecutionContext(ctx);
	expect(response.status).toBe(400);
	expect(await response.text()).toBe("Bad request body");

	// ...but the correct body should succeed
	ctx = createExecutionContext();
	response = await worker.fetch!(
		new Request("https://example.com/path", { method: "POST", body: "✨" }),
		env,
		ctx
	);
	await waitOnExecutionContext(ctx);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("✅");
});
