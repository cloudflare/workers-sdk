import {
	APIError,
	COMPLIANCE_REGION_CONFIG_PUBLIC,
} from "@cloudflare/workers-utils";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { initLogger } from "../logger";
import { createPreviewSession } from "./create-worker-preview";
import type { ComplianceConfig } from "@cloudflare/workers-utils";
import type { Dispatcher } from "undici";

vi.mock("@cloudflare/workers-auth", () => ({
	getAccessHeaders: vi.fn().mockResolvedValue({}),
}));

initLogger({
	loggerLevel: "none",
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	console: vi.fn(),
});

const account = {
	accountId: "test-account-id",
	apiToken: { apiToken: "test-api-token" },
};
const sessionPath =
	"/client/v4/accounts/test-account-id/workers/scripts/test-worker/subdomain/edge-preview";
const subdomainPath = "/client/v4/accounts/test-account-id/workers/subdomain";

describe("Worker-scoped remote binding preview sessions", () => {
	let originalDispatcher: Dispatcher;
	let mockAgent: MockAgent;

	beforeEach(() => {
		originalDispatcher = getGlobalDispatcher();
		mockAgent = new MockAgent();
		mockAgent.disableNetConnect();
		setGlobalDispatcher(mockAgent);
	});

	afterEach(async () => {
		setGlobalDispatcher(originalDispatcher);
		await mockAgent.close();
	});

	function createSession(
		complianceConfig: ComplianceConfig = COMPLIANCE_REGION_CONFIG_PUBLIC
	) {
		return createPreviewSession(
			complianceConfig,
			account,
			new AbortController().signal,
			"test-worker",
			"Wrangler"
		);
	}

	for (const { complianceRegion, subdomain } of [
		{ complianceRegion: "public", subdomain: "" },
		{ complianceRegion: "fedramp_high", subdomain: ".fed" },
	] as const) {
		for (const exchangeStatus of [200, 500]) {
			it(`creates a ${complianceRegion} session without account-wide access when token exchange returns ${exchangeStatus}`, async ({
				expect,
			}) => {
				const previewOrigin = `https://preview-token.test-subdomain${subdomain}.workers.dev`;
				mockAgent
					.get(`https://api${subdomain}.cloudflare.com`)
					.intercept({
						path: sessionPath,
						method: "GET",
						headers: { authorization: "Bearer test-api-token" },
					})
					.reply(200, {
						success: true,
						result: {
							token: "session-token",
							exchange_url: `${previewOrigin}/cdn-cgi/workers/preview/`,
						},
					});
				mockAgent
					.get(previewOrigin)
					.intercept({ path: "/cdn-cgi/workers/preview/", method: "GET" })
					.reply(exchangeStatus, { token: "expanded-session-token" });

				// Account-wide requests have no interceptor and network access is disabled.
				await expect(
					createSession({ compliance_region: complianceRegion })
				).resolves.toEqual({
					value:
						exchangeStatus === 200 ? "expanded-session-token" : "session-token",
					host: `test-worker.test-subdomain${subdomain}.workers.dev`,
				});
				mockAgent.assertNoPendingInterceptors();
			});
		}
	}

	for (const exchangeUrl of [
		undefined,
		"invalid-url",
		"https://localhost/preview",
	]) {
		it(`falls back to the account subdomain for an unusable exchange URL: ${exchangeUrl}`, async ({
			expect,
		}) => {
			const api = mockAgent.get("https://api.cloudflare.com");
			api.intercept({ path: sessionPath, method: "GET" }).reply(200, {
				success: true,
				result: { token: "session-token", exchange_url: exchangeUrl },
			});
			api.intercept({ path: subdomainPath, method: "GET" }).reply(200, {
				success: true,
				result: { subdomain: "test-subdomain" },
			});

			await expect(createSession()).resolves.toEqual({
				value: "session-token",
				host: "test-worker.test-subdomain.workers.dev",
			});
			mockAgent.assertNoPendingInterceptors();
		});
	}

	it("registers a missing account subdomain for legacy session responses", async ({
		expect,
	}) => {
		const api = mockAgent.get("https://api.cloudflare.com");
		api.intercept({ path: sessionPath, method: "GET" }).reply(200, {
			success: true,
			result: { token: "session-token" },
		});
		api.intercept({ path: subdomainPath, method: "GET" }).reply(404, {
			success: false,
			errors: [{ code: 10007, message: "Subdomain not found" }],
		});
		api.intercept({ path: subdomainPath, method: "PUT" }).reply(200, {
			success: true,
			result: { subdomain: "registered-subdomain" },
		});

		await expect(createSession()).resolves.toEqual({
			value: "session-token",
			host: "test-worker.registered-subdomain.workers.dev",
		});
		mockAgent.assertNoPendingInterceptors();
	});

	it("propagates Worker authorization errors without retrying the account endpoint", async ({
		expect,
	}) => {
		mockAgent
			.get("https://api.cloudflare.com")
			.intercept({ path: sessionPath, method: "GET" })
			.reply(403, {
				success: false,
				errors: [{ code: 10000, message: "Authentication error" }],
			});

		await expect(createSession()).rejects.toMatchObject({
			constructor: APIError,
			code: 10000,
		});
		mockAgent.assertNoPendingInterceptors();
	});
});
