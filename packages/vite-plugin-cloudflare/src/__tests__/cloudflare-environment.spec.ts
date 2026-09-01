import { CoreHeaders, Miniflare, Response } from "miniflare";
import { resolveConfig } from "vite";
import { onTestFinished, test, vi } from "vitest";
import { CloudflareDevEnvironment } from "../cloudflare-environment";
import { GET_EXPORT_TYPES_PATH, UNKNOWN_HOST } from "../shared";
import type { ResolvedWorkerConfig } from "../plugin-config";

test("surfaces the response body when fetching Worker export types fails", async ({
	expect,
}) => {
	const config = await resolveConfig(
		{
			configFile: false,
			environments: { auxiliary_worker: {} },
			logLevel: "silent",
		},
		"serve"
	);
	const environment = new CloudflareDevEnvironment("auxiliary_worker", config);
	const miniflare = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "test-worker",
					compatibilityDate: "2024-12-30",
					manifest: {
						mainModule: "index.mjs",
						modules: {
							"index.mjs": {
								type: "esm",
								contents: "export default {}",
							},
						},
					},
					env: {},
					exports: {},
				},
			},
		],
	});

	onTestFinished(async () => {
		await miniflare.dispose();
	});

	const dispatchFetch = vi.spyOn(miniflare, "dispatchFetch").mockResolvedValue(
		new Response("Error: Network connection lost.", {
			status: 500,
			statusText: "Internal Server Error",
		})
	);
	const workerConfig = {
		name: "auxiliary-worker",
	} as ResolvedWorkerConfig;

	await expect(
		environment.fetchWorkerExportTypes(miniflare, workerConfig)
	).rejects.toThrow(
		'Failed to fetch export types for Worker "auxiliary-worker" (500 Internal Server Error): Error: Network connection lost.'
	);
	expect(dispatchFetch).toHaveBeenCalledWith(
		new URL(GET_EXPORT_TYPES_PATH, UNKNOWN_HOST),
		{ headers: { [CoreHeaders.ROUTE_OVERRIDE]: "auxiliary-worker" } }
	);
});
