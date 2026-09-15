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
import type { UserAuthConfig } from "../src/config-file/auth";
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

/**
 * A CLI identity that shares nothing with wrangler's, so any copy that leaks
 * wrangler branding back into the shared device flow shows up as a failure
 * here rather than being invisible in wrangler's own test suite.
 */
const TEST_CLI = {
	displayName: "TestCLI",
	deviceLoginCommand: "testcli auth login --device",
};

function createTestContext(): {
	ctx: OAuthFlowContext;
	logs: string[];
	opened: string[];
	stored: () => UserAuthConfig | undefined;
} {
	const logs: string[] = [];
	const opened: string[] = [];
	const record =
		(...prefix: unknown[]) =>
		(...args: unknown[]) => {
			logs.push([...prefix, ...args].join(" "));
		};

	let stored: UserAuthConfig | undefined;

	return {
		logs,
		opened,
		stored: () => stored,
		ctx: {
			logger: {
				// Debug output is not user-facing copy, so it is not recorded.
				debug: () => {},
				info: record(),
				log: record(),
				warn: record(),
				error: record(),
			},
			isNonInteractiveOrCI: () => false,
			openInBrowser: async (url: string) => {
				opened.push(url);
			},
			hasEnvCredentials: () => false,
			clientId: "test-client-id",
			consent: {
				granted: { url: "https://example.com/granted" },
				denied: {
					url: "https://example.com/denied",
					error: "consent denied page copy",
				},
			},
			displayName: TEST_CLI.displayName,
			deviceLoginCommand: TEST_CLI.deviceLoginCommand,
			redirectUri: "http://localhost:9999/oauth/callback",
			storageFactory: () => ({
				read: () => stored,
				write: (config: UserAuthConfig) => {
					stored = config;
				},
				clear: () => {
					const existed = stored !== undefined;
					stored = undefined;
					return existed;
				},
				path: () => "<in-memory>",
			}),
			allowGlobalAuthKey: true,
			temporary: undefined,
		},
	};
}

/** Handle the Cloudflare Access probe the OAuth requests make first. */
function mockAccessProbe() {
	return http.get(
		"https://dash.cloudflare.com/",
		() => new HttpResponse(null, { status: 200 })
	);
}

function mockDeviceAuth(overrides: Record<string, unknown> = {}) {
	return http.post("*/oauth2/device/auth", () =>
		HttpResponse.json({
			device_code: "test-device-code",
			user_code: "WDJB-MJHT",
			verification_uri: "https://dash.cloudflare.com/oauth2/device",
			expires_in: 600,
			interval: 5,
			...overrides,
		})
	);
}

function mockPoll(
	status: number,
	body: Record<string, unknown>,
	counter?: { calls: number }
) {
	return http.post("*/oauth2/token", () => {
		if (counter) {
			counter.calls += 1;
		}
		return HttpResponse.json(body, { status });
	});
}

beforeEach(() => {
	clearAccessCaches();
	msw.use(mockAccessProbe());
});

describe("device flow copy", () => {
	beforeEach(() => {
		msw.use(mockDeviceAuth());
	});

	it("addresses the user with the consumer's display name, not wrangler's", async ({
		expect,
	}) => {
		msw.use(
			mockPoll(200, {
				access_token: "test-access-token",
				expires_in: 100000,
				refresh_token: "test-refresh-token",
				scope: "account:read",
			})
		);

		const { ctx, logs, opened, stored } = createTestContext();
		const flow = createOAuthFlow(ctx);

		expect(
			await flow.login({
				complianceConfig: COMPLIANCE_CONFIG,
				scopes: ["account:read"],
				device: true,
			})
		).toBe(true);

		const output = logs.join("\n");
		expect(output).toContain("To authorize TestCLI, please visit:");
		expect(output.toLowerCase()).not.toContain("wrangler");
		expect(opened).toEqual([
			"https://dash.cloudflare.com/oauth2/device?user_code=WDJB-MJHT",
		]);
		expect(stored()?.oauth_token).toBe("test-access-token");
	});

	it("names the consumer in the consent-denied error", async ({ expect }) => {
		msw.use(mockPoll(400, { error: "access_denied" }));

		const { ctx } = createTestContext();
		const flow = createOAuthFlow(ctx);

		await expect(
			flow.login({
				complianceConfig: COMPLIANCE_CONFIG,
				scopes: ["account:read"],
				device: true,
			})
		).rejects.toThrow(
			"Consent denied. You must grant consent to TestCLI in order to login."
		);
	});

	it("quotes the consumer's device-login command when the code expires", async ({
		expect,
	}) => {
		msw.use(mockPoll(400, { error: "expired_token" }));

		const { ctx } = createTestContext();
		const flow = createOAuthFlow(ctx);

		await expect(
			flow.login({
				complianceConfig: COMPLIANCE_CONFIG,
				scopes: ["account:read"],
				device: true,
			})
		).rejects.toThrow(
			"Device code expired before the request was approved. Please run `testcli auth login --device` again to obtain a new code."
		);
	});
});

async function login(ctx: OAuthFlowContext): Promise<boolean> {
	return createOAuthFlow(ctx).login({
		complianceConfig: COMPLIANCE_CONFIG,
		scopes: ["account:read"],
		device: true,
	});
}

describe("device flow verification URL trust", () => {
	beforeEach(() => {
		// Should the trust check ever stop firing, the flow would fall through to
		// polling; this handler makes that regression fail fast with a distinctly
		// different error instead of retrying until the test times out.
		msw.use(mockPoll(400, { error: "access_denied" }));
	});

	it("refuses an off-domain `verification_uri_complete`, without printing or opening it", async ({
		expect,
	}) => {
		msw.use(
			mockDeviceAuth({
				verification_uri_complete:
					"https://evil.example.com/oauth2/device?user_code=WDJB-MJHT",
			})
		);

		const { ctx, logs, opened } = createTestContext();

		await expect(login(ctx)).rejects.toThrow(
			"The authorization server returned an untrusted `verification_uri_complete`: https://evil.example.com/oauth2/device?user_code=WDJB-MJHT"
		);
		expect(opened).toEqual([]);
		expect(logs.join("\n")).not.toContain("evil.example.com");
	});

	it("refuses a subdomain of the auth domain", async ({ expect }) => {
		msw.use(
			mockDeviceAuth({
				verification_uri: "https://oauth2.dash.cloudflare.com/device",
				verification_uri_complete: undefined,
			})
		);

		const { ctx, opened } = createTestContext();

		await expect(login(ctx)).rejects.toThrow(
			"The authorization server returned an untrusted `verification_uri`: https://oauth2.dash.cloudflare.com/device"
		);
		expect(opened).toEqual([]);
	});

	it("refuses a non-https `verification_uri`", async ({ expect }) => {
		msw.use(
			mockDeviceAuth({
				verification_uri: "http://dash.cloudflare.com/oauth2/device",
				verification_uri_complete: undefined,
			})
		);

		const { ctx, opened } = createTestContext();

		await expect(login(ctx)).rejects.toThrow(
			"Expected an `https` URL on `dash.cloudflare.com`. Refusing to display or open it."
		);
		expect(opened).toEqual([]);
	});

	it("refuses embedded credentials even on the right host", async ({
		expect,
	}) => {
		// Browsers de-emphasise or strip userinfo, so `user:pw@host` is a display
		// spoofing vector rather than anything the auth server needs.
		msw.use(
			mockDeviceAuth({
				verification_uri_complete:
					"https://dash.cloudflare.com:pw@dash.cloudflare.com/oauth2/device",
			})
		);

		const { ctx, opened } = createTestContext();

		await expect(login(ctx)).rejects.toThrow(
			"The authorization server returned an untrusted `verification_uri_complete`"
		);
		expect(opened).toEqual([]);
	});
});

describe("device flow unusable responses", () => {
	it("reports a non-2xx token response that carries no OAuth error code", async ({
		expect,
	}) => {
		msw.use(mockDeviceAuth());
		// The Cloudflare API envelope, as an intermediary or a misrouted request
		// might produce. There is no top-level `error` member to switch on.
		msw.use(
			mockPoll(400, {
				success: false,
				errors: [{ code: 10000, message: "Authentication error" }],
			})
		);

		const { ctx } = createTestContext();

		await expect(login(ctx)).rejects.toThrow(
			"The token endpoint returned a response that could not be interpreted (HTTP 400 Bad Request)."
		);
	});

	it("reports a 2xx token response with no usable grant instead of crashing", async ({
		expect,
	}) => {
		msw.use(mockDeviceAuth());
		// Reading this as a token grant is what produced
		// `RangeError: Invalid time value` from `expires_in` being `undefined`.
		msw.use(mockPoll(200, { success: true }));

		const { ctx, stored } = createTestContext();

		await expect(login(ctx)).rejects.toThrow(
			"The token endpoint returned a response that could not be interpreted (HTTP 200 OK)."
		);
		expect(stored()).toBeUndefined();
	});

	it("surfaces the standard `error_description` when the server sends one", async ({
		expect,
	}) => {
		msw.use(mockDeviceAuth());
		msw.use(
			mockPoll(200, { error_description: "token issuance is disabled here" })
		);

		const { ctx } = createTestContext();

		await expect(login(ctx)).rejects.toThrow(
			"(HTTP 200 OK: token issuance is disabled here)"
		);
	});

	it("keeps polling through retryable statuses, then reports them rather than a timeout", async ({
		expect,
	}) => {
		// `expires_in` bounds the run: polls at t=0s and t=1s, then the deadline
		// passes. `interval` is the server's own floor-respecting value.
		msw.use(mockDeviceAuth({ expires_in: 2, interval: 1 }));
		const poll = { calls: 0 };
		msw.use(mockPoll(503, { message: "upstream unavailable" }, poll));

		const { ctx } = createTestContext();

		await expect(login(ctx)).rejects.toThrow(
			"Gave up waiting for device authorization: the token endpoint kept returning responses that could not be interpreted (last: HTTP 503 Service Unavailable).\nEnable debug logging to see the full response, then run `testcli auth login --device` to try again."
		);
		expect(poll.calls).toBeGreaterThan(1);
	});

	it("still reports a plain timeout when the user simply never approves", async ({
		expect,
	}) => {
		msw.use(mockDeviceAuth({ expires_in: 2, interval: 1 }));
		// One transient failure followed by well-formed `authorization_pending`
		// replies must not be mistaken for a broken endpoint.
		let firstPoll = true;
		msw.use(
			http.post("*/oauth2/token", () => {
				if (firstPoll) {
					firstPoll = false;
					return HttpResponse.text("<!DOCTYPE html><html></html>", {
						status: 502,
					});
				}
				return HttpResponse.json(
					{ error: "authorization_pending" },
					{
						status: 400,
					}
				);
			})
		);

		const { ctx } = createTestContext();

		await expect(login(ctx)).rejects.toThrow(
			"Device authorization timed out after 2 seconds. Please run `testcli auth login --device` again to obtain a new code."
		);
	});

	it("reports an unusable device authorization response instead of timing out after `NaN`", async ({
		expect,
	}) => {
		// `expires_in` missing: the deadline arithmetic used to yield `NaN`, which
		// skips the poll loop entirely and reports "timed out after NaN minutes".
		msw.use(
			http.post("*/oauth2/device/auth", () =>
				HttpResponse.json({
					device_code: "test-device-code",
					user_code: "WDJB-MJHT",
					verification_uri: "https://dash.cloudflare.com/oauth2/device",
				})
			)
		);

		const { ctx, opened } = createTestContext();

		await expect(login(ctx)).rejects.toThrow(
			"The device authorization endpoint returned a response that could not be interpreted (HTTP 200 OK)."
		);
		expect(opened).toEqual([]);
	});
});
