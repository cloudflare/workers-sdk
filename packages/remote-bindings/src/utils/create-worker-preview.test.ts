import {
	APIError,
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	fetchResultBase,
} from "@cloudflare/workers-utils";
import { fetch } from "undici";
import { beforeEach, describe, it, vi } from "vitest";
import { createPreviewSession } from "./create-worker-preview";

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	fetchResultBase: vi.fn(),
}));

vi.mock("undici", async (importOriginal) => ({
	...(await importOriginal<typeof import("undici")>()),
	fetch: vi.fn(),
}));

function createAPIError(code: number): APIError {
	const error = new APIError({
		text: "A request to the Cloudflare API failed.",
		status: 403,
		telemetryMessage: false,
	});
	error.code = code;
	return error;
}

describe("createPreviewSession", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("uses the Worker-scoped exchange URL when account metadata is inaccessible", async ({
		expect,
	}) => {
		vi.mocked(fetch).mockRejectedValue(new Error("exchange unavailable"));
		vi.mocked(fetchResultBase).mockImplementation(async (_config, resource) => {
			if (resource.endsWith("/subdomain/edge-preview")) {
				return {
					token: "test-session-token",
					exchange_url:
						"https://preview-token.test-subdomain.workers.dev/cdn-cgi/workers/preview/",
				};
			}
			throw createAPIError(10000);
		});

		const session = await createPreviewSession(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			{
				accountId: "test-account-id",
				apiToken: { apiToken: "test-api-token" },
			},
			new AbortController().signal,
			"test-worker"
		);

		expect(fetchResultBase).toHaveBeenCalledTimes(1);
		expect(session).toEqual({
			value: "test-session-token",
			host: "test-worker.test-subdomain.workers.dev",
		});
	});

	it("retains subdomain registration when no exchange URL is returned", async ({
		expect,
	}) => {
		vi.mocked(fetchResultBase).mockImplementation(
			async (_config, resource, init) => {
				if (resource.endsWith("/subdomain/edge-preview")) {
					return { token: "test-session-token" };
				}
				if (init?.method === "PUT") {
					return { subdomain: "registered-subdomain" };
				}
				throw createAPIError(10007);
			}
		);

		const session = await createPreviewSession(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			{
				accountId: "test-account-id",
				apiToken: { apiToken: "test-api-token" },
			},
			new AbortController().signal,
			"test-worker"
		);

		expect(fetchResultBase).toHaveBeenCalledTimes(3);
		expect(session).toEqual({
			value: "test-session-token",
			host: "test-worker.registered-subdomain.workers.dev",
		});
	});
});
