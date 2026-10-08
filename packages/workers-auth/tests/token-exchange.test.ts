import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, it, vi } from "vitest";
import { clearAccessCaches } from "../src/access";
import { ErrorAuthServerUnreachable } from "../src/errors";
import { fetchAuthToken } from "../src/token-exchange";

const msw = setupServer();

beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
	msw.resetHandlers();
	clearAccessCaches();
});
afterAll(() => msw.close());

const logger = {
	debug: () => {},
	info: () => {},
	log: () => {},
	warn: () => {},
	error: () => {},
};

describe("fetchAuthToken", () => {
	it("gives up on a token endpoint that never responds", async ({ expect }) => {
		// Shrink the real timeout so the test doesn't have to wait for it.
		const timeout = AbortSignal.timeout.bind(AbortSignal);
		vi.spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(10));

		msw.use(
			// Access probe: the auth domain is not behind Access.
			http.get("https://dash.cloudflare.com/", () =>
				HttpResponse.text("", { status: 200 })
			),
			// A stalled proxy tunnel: the request is accepted but never answered.
			http.post("https://dash.cloudflare.com/oauth2/token", async () => {
				await delay("infinite");
				return HttpResponse.json({});
			})
		);

		const result = fetchAuthToken(
			new URLSearchParams({ grant_type: "authorization_code" }),
			logger,
			() => false
		);

		await expect(result).rejects.toBeInstanceOf(ErrorAuthServerUnreachable);
		await expect(result).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Could not reach the Cloudflare auth server at https://dash.cloudflare.com/oauth2/token (timed out after 30 seconds).]`
		);
	}, 2_000);
});
