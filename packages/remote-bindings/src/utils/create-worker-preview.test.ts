import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { initLogger } from "../logger";
import { createPreviewSession } from "./create-worker-preview";

initLogger({
	loggerLevel: "none",
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	console: vi.fn(),
});

/**
 * A Worker-scoped, account-owned API token can read and edit one Worker but has
 * no account-level Workers Scripts access. The account-scoped
 * `/accounts/:accountId/workers/subdomain/edge-preview` endpoint rejects such a
 * token with `Authentication error [code: 10000]`, which is what
 * `getPlatformProxy({ remoteBindings: true })` reported.
 */
describe("createPreviewSession", () => {
	let mockAgent: MockAgent;
	let previousDispatcher: ReturnType<typeof getGlobalDispatcher>;

	beforeEach(() => {
		previousDispatcher = getGlobalDispatcher();
		mockAgent = new MockAgent();
		mockAgent.disableNetConnect();
		setGlobalDispatcher(mockAgent);
	});

	afterEach(async () => {
		await mockAgent.close();
		setGlobalDispatcher(previousDispatcher);
	});

	it("creates a preview session for a Worker-scoped token without account-level Workers access", async ({
		expect,
	}) => {
		const api = mockAgent.get("https://api.cloudflare.com");

		// The account-scoped preview session endpoint is refused for granular,
		// Worker-scoped tokens. Requesting it is the reported bug.
		api
			.intercept({
				method: "GET",
				path: "/client/v4/accounts/test-account-id/workers/subdomain/edge-preview",
			})
			.reply(403, {
				success: false,
				errors: [{ code: 10000, message: "Authentication error" }],
				messages: [],
				result: null,
			});

		// The Worker-scoped preview session endpoint only needs access to the
		// Worker the token is scoped to.
		api
			.intercept({
				method: "GET",
				path: "/client/v4/accounts/test-account-id/workers/scripts/test-worker/subdomain/edge-preview",
			})
			.reply(200, {
				success: true,
				result: { token: "test-session-token" },
				errors: [],
				messages: [],
			});

		api
			.intercept({
				method: "GET",
				path: "/client/v4/accounts/test-account-id/workers/subdomain",
			})
			.reply(200, {
				success: true,
				result: { subdomain: "test-subdomain" },
				errors: [],
				messages: [],
			});

		const session = await createPreviewSession(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			{
				accountId: "test-account-id",
				apiToken: { apiToken: "test-api-token" },
			},
			new AbortController().signal,
			"test-worker",
			"Wrangler"
		);

		expect(session.value).toBe("test-session-token");
		expect(session.host).toBe("test-worker.test-subdomain.workers.dev");
	});
});
