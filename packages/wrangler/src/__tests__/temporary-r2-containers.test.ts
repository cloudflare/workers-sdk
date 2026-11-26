import * as fs from "node:fs";
import * as path from "node:path";
import { OpenAPI } from "@cloudflare/containers-shared";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, vi } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockTemporaryPreviewAccount } from "./helpers/mock-temporary-account";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

const eventCode = "ABCD-EFGH-JKMN";

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
		expect(std.err).toContain("Temporary account ready:");
		expect(std.out).toContain("Created bucket 'my-bucket'");
		const cache = fs.readFileSync(
			path.join(getGlobalConfigPath(), "wrangler-temporary-account.toml"),
			"utf8"
		);
		expect(cache).not.toContain(eventCode);
		expect(std.out).not.toContain(eventCode);
		expect(std.err).not.toContain(eventCode);
	});

	it("keeps piped object contents free of temporary-account notices", async ({
		expect,
		onTestFinished,
	}) => {
		mockTemporaryPreviewAccount();
		msw.use(
			http.get(
				"*/accounts/preview-account-id/r2/buckets/my-bucket/objects/photo.png",
				() => HttpResponse.text("object-bytes")
			)
		);
		const stdoutWrite = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
		onTestFinished(() => stdoutWrite.mockRestore());

		await runWrangler(
			"r2 object get my-bucket/photo.png --remote --pipe --temporary"
		);

		const written = Buffer.concat(
			stdoutWrite.mock.calls.map(([chunk]) => Buffer.from(chunk))
		);
		expect(written.toString()).toBe("object-bytes");
		expect(std.out).toBe("");
		expect(std.err).toContain("Temporary account ready:");
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
});
