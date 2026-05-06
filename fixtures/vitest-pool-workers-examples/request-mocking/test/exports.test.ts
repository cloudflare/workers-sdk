// These tests exercise the "integration-self" worker invocation pattern:
// `exports.default.fetch(...)`. workerd dispatches each call into a fresh
// request I/O context, separate from the runner Durable Object context where
// `setupNetwork()` was enabled in `beforeAll`. This crosses workerd's request
// I/O context boundary, which currently surfaces an upstream MSW bug.
//
// ─────────────────────────────────────────────────────────────────────────────
// Upstream bug (MSW 2.14+):
//
// `defineNetwork()` (msw/src/core/experimental/define-network.ts) creates a
// single `AbortController` in `enable()`:
//
//     listenersController = new AbortController()
//
// Inside the per-request `'frame'` callback (which fires in a foreign request
// context), MSW registers a per-frame listener using that signal:
//
//     frame.events.on('*', (event) => events.emit(event), {
//       signal: listenersController.signal,
//     })
//
// rettime then accesses `signal.aborted` (and would later call
// `signal.addEventListener('abort', ...)`). Because the AbortController was
// created in the original request context but is being read from a foreign
// one, workerd refuses with:
//
//     Error: Cannot perform I/O on behalf of a different request.
//     I/O objects (such as streams, request/response bodies, and others)
//     created in the context of one request handler cannot be accessed from
//     a different request's handler. (I/O type: RefcountedCanceler)
//
// The fix lives in MSW (or `@msw/cloudflare`): replace the shared
// `listenersController` with a per-frame `AbortController` created inside the
// `'frame'` callback (and therefore owned by the same request context that
// consumes its signal).
//
// These tests use `it.fails` so the suite stays green while the bug exists —
// they will start failing (drawing attention) once the upstream fix lands, at
// which point swap `it.fails` for `it`.
// ─────────────────────────────────────────────────────────────────────────────
import { exports } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { it } from "vitest";
import { network } from "./server";

it.fails("mocks GET requests via exports.default.fetch", async ({ expect }) => {
	network.use(
		http.get("https://cloudflare.com/exports", () => {
			return HttpResponse.text("🟢");
		})
	);

	const response = await exports.default.fetch("https://example.com/exports");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("🟢");
});

it.fails("mocks POST requests via exports.default.fetch", async ({
	expect,
}) => {
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
