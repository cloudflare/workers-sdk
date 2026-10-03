import * as fs from "node:fs";
import * as path from "node:path";
import { OpenAPI } from "@cloudflare/containers-shared";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

const temporaryPreviewAccountUrl =
	"https://api.cloudflare.com/client/v4/provisioning/previews";
const eventCode = "ABCD-EFGH-JKMN";

/**
 * Mocks the temporary preview-account endpoints and records each creation
 * request body.
 *
 * @returns The list of creation request bodies, appended to as requests arrive.
 */
function mockTemporaryPreviewAccount(): unknown[] {
	const creationRequests: unknown[] = [];
	msw.use(
		// Small k/g so the proof-of-work solve is instant.
		http.post(`${temporaryPreviewAccountUrl}/challenge`, () =>
			HttpResponse.json(
				createFetchResult({
					challengeToken: "challenge-token",
					seed: Buffer.alloc(32, 1).toString("base64url"),
					k: 2,
					g: 2,
					s: 16,
					expiresAt: 9999999999,
				})
			)
		),
		http.post(temporaryPreviewAccountUrl, async ({ request }) => {
			const body = (await request.json()) as { eventCode?: string };
			creationRequests.push(body);
			return HttpResponse.json(
				createFetchResult({
					account: {
						id: "preview-account-id",
						name: "Preview Account Alpha",
						apiToken: "preview-account-token",
						expiresAt: "2027-01-01T00:00:00.000Z",
					},
					claim: {
						url: "https://dash.cloudflare.com/claim-preview",
						expiresAt: "2027-01-02T00:00:00.000Z",
					},
					...(body.eventCode ? { eventCodeAccepted: true } : {}),
				})
			);
		})
	);
	return creationRequests;
}

describe("--temporary on R2 and Containers commands", () => {
	mockApiToken({ apiToken: null });
	mockAccountId({ accountId: null });
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		// Non-interactive mode prints the terms notice instead of prompting.
		setIsTTY(false);
		OpenAPI.BASE = "";
	});

	it("creates an event account from an R2 command", async ({ expect }) => {
		const creationRequests = mockTemporaryPreviewAccount();
		let authorization: string | null = null;
		msw.use(
			http.post(
				"*/accounts/preview-account-id/r2/buckets",
				({ request }) => {
					authorization = request.headers.get("Authorization");
					return HttpResponse.json(createFetchResult({}));
				},
				{ once: true }
			)
		);

		await runWrangler(
			`r2 bucket create my-bucket --temporary --event-code " ${eventCode} "`
		);

		expect(creationRequests).toEqual([expect.objectContaining({ eventCode })]);
		expect(authorization).toBe("Bearer preview-account-token");
		expect(std.out).toContain("Temporary account ready:");
		expect(std.out).toContain("Created bucket 'my-bucket'");
		const cache = fs.readFileSync(
			path.join(getGlobalConfigPath(), "wrangler-temporary-account.toml"),
			"utf8"
		);
		expect(cache).not.toContain(eventCode);
		expect(std.out).not.toContain(eventCode);
		expect(std.err).not.toContain(eventCode);
	});

	it("rejects an event code when a temporary account is already cached", async ({
		expect,
	}) => {
		const creationRequests = mockTemporaryPreviewAccount();
		msw.use(
			http.get("*/accounts/preview-account-id/r2/buckets", () =>
				HttpResponse.json(createFetchResult({ buckets: [] }))
			)
		);

		await runWrangler("r2 bucket list --temporary");
		await expect(
			runWrangler(`r2 bucket list --temporary --event-code ${eventCode}`)
		).rejects.toThrow(
			"A temporary account is already cached. Rerun without --event-code to reuse it"
		);

		expect(creationRequests).toHaveLength(1);
		expect(creationRequests[0]).not.toHaveProperty("eventCode");
	});

	it("requires --temporary when --event-code is passed", async ({ expect }) => {
		await expect(
			runWrangler(`r2 bucket create my-bucket --event-code ${eventCode}`)
		).rejects.toThrow("--event-code requires --temporary");
	});

	it("explains that R2 needs an event account when access is denied", async ({
		expect,
	}) => {
		mockTemporaryPreviewAccount();
		msw.use(
			http.post(
				"*/accounts/preview-account-id/r2/buckets",
				() =>
					HttpResponse.json(
						{
							success: false,
							result: null,
							errors: [{ code: 10000, message: "Authentication error" }],
							messages: [],
						},
						{ status: 403 }
					),
				{ once: true }
			)
		);

		await expect(
			runWrangler("r2 bucket create my-bucket --temporary")
		).rejects.toThrow();

		expect(std.err).toContain(
			"R2 is only available on temporary accounts created for an event."
		);
	});

	it("authenticates Containers commands with the temporary account", async ({
		expect,
	}) => {
		const creationRequests = mockTemporaryPreviewAccount();
		let authorization: string | null = null;
		msw.use(
			http.get(
				"*/accounts/preview-account-id/containers/dash/applications",
				({ request }) => {
					authorization = request.headers.get("Authorization");
					return HttpResponse.json({
						...createFetchResult([]),
						result_info: { per_page: 0 },
					});
				},
				{ once: true }
			)
		);

		await runWrangler(`containers list --temporary --event-code ${eventCode}`);

		expect(creationRequests).toEqual([expect.objectContaining({ eventCode })]);
		expect(authorization).toBe("Bearer preview-account-token");
	});

	it.for([
		"r2 bucket domain list my-bucket",
		"r2 bucket sippy get my-bucket",
		"containers registries list",
	])("does not accept --temporary on `%s`", async (command, { expect }) => {
		await expect(runWrangler(`${command} --temporary`)).rejects.toThrow(
			/Unknown argument: temporary/
		);
	});
});
