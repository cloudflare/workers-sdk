import { Response } from "miniflare";
import { test } from "vitest";
import { CloudflareDevEnvironment } from "../cloudflare-environment";
import type { ResolvedWorkerConfig } from "../plugin-config";
import type { Miniflare } from "miniflare";

test("surfaces the response body when fetching Worker export types fails", async ({
	expect,
}) => {
	const environment = {
		fetchWorkerExportTypes:
			CloudflareDevEnvironment.prototype.fetchWorkerExportTypes,
	};
	const miniflare = {
		dispatchFetch() {
			return Promise.resolve(
				new Response("Error: Network connection lost.", {
					status: 500,
					statusText: "Internal Server Error",
				})
			);
		},
	} as Partial<Miniflare> as Miniflare;
	const workerConfig = {
		name: "auxiliary-worker",
	} as Partial<ResolvedWorkerConfig> as ResolvedWorkerConfig;

	await expect(
		environment.fetchWorkerExportTypes(miniflare, workerConfig)
	).rejects.toThrow(
		'Failed to fetch export types for Worker "auxiliary-worker" (500 Internal Server Error): Error: Network connection lost.'
	);
});
