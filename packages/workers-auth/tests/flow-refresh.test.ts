import os from "node:os";
import path from "node:path";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	it,
} from "vitest";
import { clearAccessCaches } from "../src/access";
import { createOAuthFlow } from "../src/flow";
import type {
	AuthConfigStorage,
	UserAuthConfig,
} from "../src/config-file/auth";
import type { OAuthFlowContext } from "../src/context";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const msw = setupServer();

beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
	msw.restoreHandlers();
	msw.resetHandlers();
});
afterAll(() => msw.close());

const COMPLIANCE_CONFIG: ComplianceConfig = { compliance_region: undefined };

const PAST_DATE = new Date(Date.now() - 100_000_000).toISOString();
const FUTURE_DATE = new Date(Date.now() + 100_000_000).toISOString();

/**
 * Create a test context wired to an in-memory storage backend.
 *
 * @returns The context, the logs array, and a handle to the storage so
 *   tests can manipulate the "on-disk" state between calls.
 */
function createTestContext(): {
	ctx: OAuthFlowContext;
	logs: { level: string; message: string }[];
	storage: AuthConfigStorage;
} {
	const logs: { level: string; message: string }[] = [];
	let stored: UserAuthConfig | undefined;

	const storage: AuthConfigStorage = {
		read: () => stored,
		write: (config: UserAuthConfig) => {
			stored = config;
		},
		clear: () => {
			const existed = stored !== undefined;
			stored = undefined;
			return existed;
		},
		path: () => path.join(os.tmpdir(), "workers-auth-test-config"),
	};

	const logger: OAuthFlowContext["logger"] = {
		debug: (...args: unknown[]) => {
			logs.push({ level: "debug", message: args.join(" ") });
		},
		info: (...args: unknown[]) => {
			logs.push({ level: "info", message: args.join(" ") });
		},
		log: (...args: unknown[]) => {
			logs.push({ level: "log", message: args.join(" ") });
		},
		warn: (...args: unknown[]) => {
			logs.push({ level: "warn", message: args.join(" ") });
		},
		error: (...args: unknown[]) => {
			logs.push({ level: "error", message: args.join(" ") });
		},
	};

	return {
		logs,
		storage,
		ctx: {
			logger,
			isNonInteractiveOrCI: () => true,
			openInBrowser: async () => {},
			hasEnvCredentials: () => false,
			clientId: "test-client-id",
			consent: {
				granted: { url: "https://example.com/granted" },
				denied: {
					url: "https://example.com/denied",
					error: "consent denied",
				},
			},
			displayName: "TestCLI",
			deviceLoginCommand: "testcli auth login --device",
			redirectUri: "http://localhost:9999/oauth/callback",
			storageFactory: () => storage,
			allowGlobalAuthKey: true,
			temporary: undefined,
		},
	};
}

/** Handle the Cloudflare Access probe. */
function mockAccessProbe() {
	return http.get(
		"https://dash.cloudflare.com/",
		() => new HttpResponse(null, { status: 200 })
	);
}

/**
 * Return an MSW handler that always succeeds for the token endpoint.
 *
 * @param overrides - Optional overrides for the response body.
 * @returns An MSW handler for `POST *​/oauth2/token`.
 */
function mockTokenSuccess(overrides: Record<string, unknown> = {}) {
	return http.post("*/oauth2/token", () =>
		HttpResponse.json({
			access_token: "fresh-access-token",
			expires_in: 3600,
			refresh_token: "RT_NEXT",
			scope: "account:read",
			token_type: "bearer",
			...overrides,
		})
	);
}

describe("refreshToken (via loginOrRefreshIfRequired)", () => {
	beforeEach(() => {
		clearAccessCaches();
	});

	it("refreshes an expired token and persists the result", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		msw.use(mockAccessProbe(), mockTokenSuccess());

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(result).toEqual({ loggedIn: true });
		const written = storage.read();
		expect(written?.oauth_token).toBe("fresh-access-token");
		expect(written?.refresh_token).toBe("RT_NEXT");
	});

	it("skips the exchange when the token is already fresh after lock acquisition", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		// Token is not expired — no exchange should happen.
		storage.write({
			oauth_token: "still-valid",
			refresh_token: "RT_A",
			expiration_time: FUTURE_DATE,
			scopes: ["account:read"],
		});

		// No MSW handler for token endpoint — if an exchange is attempted,
		// the test will fail with "unhandled request".
		msw.use(mockAccessProbe());

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(result).toEqual({ loggedIn: true });
	});

	it("retries on invalid_grant when a sibling rotated the refresh token", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		let callCount = 0;
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async ({ request }) => {
				callCount++;
				const body = new URLSearchParams(await request.text());
				const rt = body.get("refresh_token");

				if (rt === "RT_A") {
					// Simulate the first exchange failing because a sibling
					// already consumed RT_A. Before the retry, we also update
					// the "disk" to simulate the sibling's write.
					storage.write({
						oauth_token: "expired-access",
						refresh_token: "RT_B",
						expiration_time: PAST_DATE,
						scopes: ["account:read"],
					});
					return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
				}
				// RT_B succeeds.
				return HttpResponse.json({
					access_token: "fresh-from-retry",
					expires_in: 3600,
					refresh_token: "RT_C",
					scope: "account:read",
					token_type: "bearer",
				});
			})
		);

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(result).toEqual({ loggedIn: true });
		expect(callCount).toBe(2);
		const written = storage.read();
		expect(written?.oauth_token).toBe("fresh-from-retry");
		expect(written?.refresh_token).toBe("RT_C");
	});

	it("succeeds without retry when a sibling already completed the refresh", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		let callCount = 0;
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async () => {
				callCount++;
				// Before returning the error, simulate the sibling having
				// completed a full refresh (fresh access token on disk).
				storage.write({
					oauth_token: "sibling-refreshed-token",
					refresh_token: "RT_B",
					expiration_time: FUTURE_DATE,
					scopes: ["account:read"],
				});
				return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
			})
		);

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(result).toEqual({ loggedIn: true });
		// Only one call — no retry needed because the sibling already
		// wrote a fresh access token.
		expect(callCount).toBe(1);
	});

	it("gives up when invalid_grant and the on-disk token hasn't changed", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async () => {
				return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
			})
		);

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		// Non-interactive, so it can't fall back to login.
		expect(result).toEqual({
			loggedIn: false,
			reason: "token-expired-non-interactive",
		});
	});

	it("logs refresh failures at warn level", async ({ expect }) => {
		const { ctx, storage, logs } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async () => {
				return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
			})
		);

		const flow = createOAuthFlow(ctx);
		await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		const warnLogs = logs.filter((l) => l.level === "warn");
		expect(
			warnLogs.some((l) => l.message.includes("Token refresh failed"))
		).toBe(true);
		expect(warnLogs.some((l) => l.message.includes("invalid_grant"))).toBe(
			true
		);
	});

	it("logs at warn when retry also fails", async ({ expect }) => {
		const { ctx, storage, logs } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		let callCount = 0;
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async () => {
				callCount++;
				if (callCount === 1) {
					// First call fails; simulate sibling writing a different RT.
					storage.write({
						oauth_token: "expired-access",
						refresh_token: "RT_B",
						expiration_time: PAST_DATE,
						scopes: ["account:read"],
					});
				}
				// Both calls fail with invalid_grant.
				return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
			})
		);

		const flow = createOAuthFlow(ctx);
		await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(callCount).toBe(2);
		const warnLogs = logs.filter((l) => l.level === "warn");
		expect(
			warnLogs.some((l) => l.message.includes("Token refresh retry failed"))
		).toBe(true);
		expect(warnLogs.some((l) => l.message.includes("invalid_grant"))).toBe(
			true
		);
	});

	it("sends the post-lock snapshot token, not a re-read from disk", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		const sentTokens: string[] = [];
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async ({ request }) => {
				const body = new URLSearchParams(await request.text());
				const rt = body.get("refresh_token") ?? "";
				sentTokens.push(rt);

				// Simulate a sibling writing RT_B to disk between the post-lock
				// read and the exchange. Without the fix, the exchange would
				// re-read disk and send RT_B; with the fix it sends RT_A.
				storage.write({
					oauth_token: "expired-access",
					refresh_token: "RT_B",
					expiration_time: PAST_DATE,
					scopes: ["account:read"],
				});

				return HttpResponse.json({
					access_token: "fresh-access-token",
					expires_in: 3600,
					refresh_token: "RT_NEXT",
					scope: "account:read",
					token_type: "bearer",
				});
			})
		);

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(result).toEqual({ loggedIn: true });
		// The exchange should have used RT_A (the post-lock snapshot), not
		// RT_B (the value a sibling wrote to disk mid-exchange).
		expect(sentTokens).toEqual(["RT_A"]);
	});

	it("deduplicates concurrent in-process refreshes (single-flight)", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		let callCount = 0;
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async () => {
				callCount++;
				return HttpResponse.json({
					access_token: "fresh-access-token",
					expires_in: 3600,
					refresh_token: "RT_NEXT",
					scope: "account:read",
					token_type: "bearer",
				});
			})
		);

		const flow = createOAuthFlow(ctx);
		const [r1, r2] = await Promise.all([
			flow.loginOrRefreshIfRequired({
				complianceConfig: COMPLIANCE_CONFIG,
				scopes: ["account:read"],
			}),
			flow.loginOrRefreshIfRequired({
				complianceConfig: COMPLIANCE_CONFIG,
				scopes: ["account:read"],
			}),
		]);

		expect(r1).toEqual({ loggedIn: true });
		expect(r2).toEqual({ loggedIn: true });
		// Only one token exchange should have been made.
		expect(callCount).toBe(1);
	});
});
