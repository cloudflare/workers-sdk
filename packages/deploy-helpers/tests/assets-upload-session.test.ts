import { APIError } from "@cloudflare/workers-utils";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { syncAssets } from "../src/deploy/helpers/assets";
import { initDeployHelpersContext } from "../src/shared/context";
import type { FetchResultFetcher } from "@cloudflare/workers-utils";

describe("asset upload sessions", () => {
	runInTempDir();
	const fetchResult = vi.fn<FetchResultFetcher>();
	const session = { buckets: [], jwt: "completion-token" };

	beforeEach(async () => {
		await seed({ "assets/index.html": "hello" });
		initDeployHelpersContext({
			fetchResult: fetchResult as FetchResultFetcher,
			fetchListResult: vi.fn(),
			fetchPagedListResult: vi.fn(),
			fetchKVGetValue: vi.fn(),
			confirm: vi.fn(),
			prompt: vi.fn(),
			select: vi.fn(),
			logger: {
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				log: vi.fn(),
				warn: vi.fn(),
			},
		});
	});

	it.for([undefined, "my-namespace"])(
		"retries a server error with the same manifest (namespace: %s)",
		async (dispatchNamespace, { expect }) => {
			const error = new APIError({
				text: "An unknown error has occurred",
				status: 500,
				telemetryMessage: false,
			});
			error.code = 10013;
			fetchResult.mockRejectedValueOnce(error).mockResolvedValueOnce(session);

			await expect(
				syncAssets({}, "account", "assets", "worker", dispatchNamespace)
			).resolves.toMatchObject({ jwt: session.jwt });

			expect(fetchResult).toHaveBeenCalledTimes(2);
			expect(fetchResult.mock.calls[1]).toEqual(fetchResult.mock.calls[0]);
			expect(fetchResult.mock.calls[0]).toEqual([
				{},
				dispatchNamespace
					? "/accounts/account/workers/dispatch/namespaces/my-namespace/scripts/worker/assets-upload-session"
					: "/accounts/account/workers/scripts/worker/assets-upload-session",
				{
					headers: { "Content-Type": "application/json" },
					method: "POST",
					body: expect.stringContaining('"/index.html"'),
				},
			]);
		}
	);

	it("preserves a persistent server error after three attempts without uploading assets", async ({
		expect,
	}) => {
		const error = new APIError({
			text: "An unknown error has occurred",
			status: 500,
			telemetryMessage: false,
		});
		error.code = 10013;
		fetchResult.mockRejectedValue(error);

		await expect(syncAssets({}, "account", "assets", "worker")).rejects.toBe(
			error
		);
		expect(fetchResult).toHaveBeenCalledTimes(3);
		for (const [, resource] of fetchResult.mock.calls) {
			expect(resource).toBe(
				"/accounts/account/workers/scripts/worker/assets-upload-session"
			);
		}
	});

	it.for([400, 401, 403])(
		"does not retry a client error with status %i",
		async (status, { expect }) => {
			const error = new APIError({
				text: "Request rejected",
				status,
				telemetryMessage: false,
			});
			fetchResult.mockRejectedValue(error);

			await expect(syncAssets({}, "account", "assets", "worker")).rejects.toBe(
				error
			);
			expect(fetchResult).toHaveBeenCalledTimes(1);
		}
	);
});
