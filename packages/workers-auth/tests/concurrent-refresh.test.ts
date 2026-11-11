import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, it, vi } from "vitest";
import { clearAccessCaches } from "../src/access";
import { createOAuthFlow } from "../src/flow";
import type { UserAuthConfig } from "../src/config-file/auth";
import type { OAuthFlowContext } from "../src/context";

const msw = setupServer();

beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
	msw.resetHandlers();
	clearAccessCaches();
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

describe("concurrent refresh of an expired token (#15089)", () => {
	it("does not spend the same single-use refresh token twice when two processes refresh together", async ({
		expect,
	}) => {
		// One shared "config file", as two Wrangler processes share default.toml.
		let stored: UserAuthConfig | undefined = {
			oauth_token: "expired-access",
			expiration_time: "2000-01-01T00:00:00.000Z",
			refresh_token: "refresh-0",
			scopes: ["account:read"],
		};
		const makeFlow = () =>
			createOAuthFlow({
				logger,
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
			} satisfies OAuthFlowContext);

		// The server rotates refresh tokens: each is valid exactly once.
		const spent = new Set<string>();
		let counter = 0;
		msw.use(
			http.get("https://dash.cloudflare.com/", () =>
				HttpResponse.text("", { status: 200 })
			),
			http.post("https://dash.cloudflare.com/oauth2/token", async ({ request }) => {
				const sent = new URLSearchParams(await request.text()).get(
					"refresh_token"
				);
				// A network round-trip, so the other process lands inside the window.
				await delay(50);
				if (!sent || spent.has(sent) || !sent.startsWith("refresh-")) {
					return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
				}
				spent.add(sent);
				counter++;
				return HttpResponse.json({
					access_token: `access-${counter}`,
					expires_in: 3600,
					refresh_token: `refresh-${counter}`,
					scope: "account:read",
					token_type: "bearer",
				});
			})
		);

		const results = await Promise.all([
			makeFlow().loginOrRefreshIfRequired({ compliance_region: undefined }),
			makeFlow().loginOrRefreshIfRequired({ compliance_region: undefined }),
		]);

		expect(results).toEqual([{ loggedIn: true }, { loggedIn: true }]);
		// The refresh chain must still be alive.
		expect(spent.has(stored?.refresh_token ?? "")).toBe(false);
	});
});
