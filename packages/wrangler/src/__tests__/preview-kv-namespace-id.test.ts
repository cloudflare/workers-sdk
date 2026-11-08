import { mkdirSync, writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, describe, test, vi } from "vitest";
import { clearOutputFilePath } from "../output";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

type DeploymentEnv = Record<string, { type: string; namespace_id?: string }>;

/**
 * Write a minimal Worker and a `wrangler.json` whose `previews` block binds
 * one KV namespace, mirroring the configuration reported in
 * cloudflare/workers-sdk#16775: the top-level `kv_namespaces` binding names a
 * valid namespace, and the `previews` binding is `kvBinding`.
 */
function writeWorkerWithPreviewKvBinding(kvBinding: Record<string, unknown>) {
	mkdirSync("src", { recursive: true });
	writeFileSync(
		"src/index.ts",
		"export default { fetch() { return new Response('ok'); } };"
	);
	writeFileSync(
		"wrangler.json",
		JSON.stringify({
			name: "test-worker",
			main: "src/index.ts",
			compatibility_date: "2025-01-01",
			kv_namespaces: [
				{
					binding: "SESSION",
					id: "kv-namespace-id",
					preview_id: "kv-namespace-id",
				},
			],
			previews: {
				kv_namespaces: [kvBinding],
			},
		})
	);
}

/**
 * Mock the preview lookup, creation, and deployment endpoints, returning how
 * to read the `env` sent in the preview-deployments request.
 */
function mockPreviewDeploymentRequest() {
	let deploymentEnv: DeploymentEnv | undefined;
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
			() =>
				HttpResponse.json(
					{
						success: false,
						result: null,
						errors: [{ code: 10025, message: "Preview not found" }],
					},
					{ status: 404 }
				)
		),
		http.post(`*/accounts/:accountId/workers/workers/:workerId/previews`, () =>
			HttpResponse.json({
				success: true,
				result: {
					id: "preview-id-123",
					name: "test-preview",
					slug: "test-preview",
					urls: ["https://test-preview.test-worker.cloudflare.app"],
					worker_name: "test-worker",
					created_on: new Date().toISOString(),
				},
			})
		),
		http.post(
			`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
			async ({ request }) => {
				const form = await request.formData();
				const metadata = JSON.parse(
					form.get("metadata") as unknown as string
				) as { env?: DeploymentEnv };
				deploymentEnv = metadata.env;
				return HttpResponse.json({
					success: true,
					result: {
						id: "deployment-id-123",
						preview_id: "preview-id-123",
						preview_name: "test-preview",
						urls: ["https://abc12345.test-worker.cloudflare.app"],
						compatibility_date: "2025-01-01",
						env: {},
						created_on: new Date().toISOString(),
					},
				});
			}
		),
		http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
			HttpResponse.json({
				success: true,
				result: {
					previews_base_config: {},
				},
			})
		)
	);
	return () => deploymentEnv;
}

describe("wrangler preview KV bindings", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockApiToken();
	mockAccountId();
	afterEach(() => {
		clearOutputFilePath();
		vi.restoreAllMocks();
	});

	test("should send the KV namespace_id when the previews binding uses the API-shaped namespace_id key", async ({
		expect,
	}) => {
		writeWorkerWithPreviewKvBinding({
			binding: "SESSION",
			namespace_id: "kv-namespace-id",
		});
		const readDeploymentEnv = mockPreviewDeploymentRequest();

		await runWrangler("preview --name test-preview");

		expect(std.out).toContain("Preview: test-preview");
		expect(readDeploymentEnv()?.SESSION).toEqual({
			type: "kv_namespace",
			namespace_id: "kv-namespace-id",
		});
	});

	test("should send the KV namespace_id when the previews binding uses the id key", async ({
		expect,
	}) => {
		writeWorkerWithPreviewKvBinding({
			binding: "SESSION",
			id: "kv-namespace-id",
		});
		const readDeploymentEnv = mockPreviewDeploymentRequest();

		await runWrangler("preview --name test-preview");

		expect(std.out).toContain("Preview: test-preview");
		expect(readDeploymentEnv()?.SESSION).toEqual({
			type: "kv_namespace",
			namespace_id: "kv-namespace-id",
		});
	});
});
