import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, it, vi } from "vitest";
import { clearAccessCaches } from "../src/access";
import { ErrorAuthServerUnreachable } from "../src/errors";
import { createOAuthFlow } from "../src/flow";
import { fetchAuthToken } from "../src/token-exchange";
import type { UserAuthConfig } from "../src/config-file/auth";
import type { OAuthFlowContext } from "../src/context";

const msw = setupServer();

beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
	msw.resetHandlers();
	clearAccessCaches();
	vi.useRealTimers();
	vi.restoreAllMocks();
});
afterAll(() => msw.close());

const logger = {
	debug: () => {},
	info: () => {},
	log: () => {},
	warn: () => {},
	error: () => {},
};

/**
 * Drive `AbortSignal.timeout` from Vitest's fake timers, so a test can jump
 * past the token request timeout instead of waiting for it.
 */
function useFakeTimeoutSignals() {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
		const controller = new AbortController();
		setTimeout(
			() =>
				controller.abort(
					new DOMException("The operation timed out.", "TimeoutError")
				),
			ms
		);
		return controller.signal;
	});
}

/** The auth domain is not behind Cloudflare Access. */
function mockAccessProbe() {
	return http.get("https://dash.cloudflare.com/", () =>
		HttpResponse.text("", { status: 200 })
	);
}

describe("fetchAuthToken", () => {
	it("gives up on a token endpoint that never responds", async ({ expect }) => {
		useFakeTimeoutSignals();
		msw.use(
			mockAccessProbe(),
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
		// Attach the handlers before the rejection happens.
		const assertions = Promise.all([
			expect(result).rejects.toBeInstanceOf(ErrorAuthServerUnreachable),
			expect(result).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Could not reach the Cloudflare auth server at https://dash.cloudflare.com/oauth2/token (timed out after 30 seconds).]`
			),
		]);
		await vi.advanceTimersByTimeAsync(30_000);
		await assertions;
	});
});

describe("refreshing an expired token", () => {
	it("treats a timeout while reading the response body as an unreachable server, not a rejected refresh token", async ({
		expect,
	}) => {
		msw.use(
			mockAccessProbe(),
			// The headers arrive, then the request timeout fires while the body
			// is still being read.
			http.post(
				"https://dash.cloudflare.com/oauth2/token",
				() =>
					new HttpResponse(
						new ReadableStream({
							start(controller) {
								controller.enqueue(new TextEncoder().encode("{"));
								controller.error(
									new DOMException("The operation timed out.", "TimeoutError")
								);
							},
						}),
						{ headers: { "Content-Type": "application/json" } }
					)
			)
		);

		let stored: UserAuthConfig | undefined = {
			oauth_token: "expired-access",
			expiration_time: "2000-01-01T00:00:00.000Z",
			refresh_token: "still-valid-refresh",
			scopes: ["account:read"],
		};
		const ctx = {
			logger,
			// Non-interactive, so a "rejected" refresh reports instead of
			// starting a browser login.
			isNonInteractiveOrCI: () => true,
			openInBrowser: async () => {},
			hasEnvCredentials: () => false,
			clientId: "test-client-id",
			consent: {
				granted: { url: "https://example.com/granted" },
				denied: { url: "https://example.com/denied", error: "denied" },
			},
			displayName: "TestCLI",
			deviceLoginCommand: "testcli auth login --device",
			redirectUri: "http://localhost:9999/oauth/callback",
			storageFactory: () => ({
				read: () => stored,
				write: (config: UserAuthConfig) => {
					stored = config;
				},
				clear: () => {
					stored = undefined;
					return true;
				},
				path: () => "<in-memory>",
			}),
			allowGlobalAuthKey: true,
			temporary: undefined,
		} satisfies OAuthFlowContext;

		await expect(
			createOAuthFlow(ctx).loginOrRefreshIfRequired({
				compliance_region: undefined,
			})
		).resolves.toEqual({
			loggedIn: false,
			reason: "token-refresh-unreachable",
		});
	});
});
