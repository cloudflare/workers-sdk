import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import dedent from "ts-dedent";
import { beforeEach, describe, it, vi } from "vitest";
import { mockLastDeploymentRequest } from "../deploy/helpers";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runWrangler } from "../helpers/run-wrangler";
import { toString } from "../helpers/serialize-form-data-entry";
import type { WorkerMetadata } from "@cloudflare/workers-utils";

vi.mock("@cloudflare/config", async (importOriginal) => {
	const { createConfigMock } = await import("../helpers/mock-new-config");
	return createConfigMock(importOriginal);
});

const selfBoundContainerFiles = {
	"cloudflare.config.ts": dedent`
		const counter = { name: "counter", schedulingPolicy: "durable-object" };
		export default {
			worker: {
				name: "alpha",
				entrypoint: "./index.js",
				compatibilityDate: "2025-12-02",
				exports: {
					Counter: { type: "durable-object", storage: "sqlite", container: counter },
				},
				env: {
					SELF_DO: { type: "durable-object", worker: "alpha", exportName: "Counter" },
				},
			},
			containers: [counter],
		};
	`,
	"index.js": "export default {}; export class Counter {}",
};

describe("Durable Object targets in cloudflare.config.ts", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	mockConsoleMethods();
	beforeEach(() => {
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
				() => HttpResponse.json(createFetchResult([]))
			)
		);
	});

	it.for([
		"deploy --experimental-new-config --dry-run",
		"versions upload --experimental-new-config --dry-run",
	])(
		"accepts a self-bound container without a name override with %s",
		async (command, { expect }) => {
			await seed(selfBoundContainerFiles);

			await expect(runWrangler(command)).resolves.toBeUndefined();
		}
	);

	it.for([
		{ command: "deploy --experimental-new-config --name test-name", ci: false },
		{ command: "deploy --experimental-new-config", ci: true },
		{
			command: "versions upload --experimental-new-config --name test-name",
			ci: false,
		},
		{ command: "versions upload --experimental-new-config", ci: true },
	])(
		"preserves explicit binding targets with $command (CI override: $ci)",
		async ({ command, ci }, { expect }) => {
			if (ci) {
				vi.stubEnv("WRANGLER_CI_OVERRIDE_NAME", "test-name");
			}
			await seed({
				"cloudflare.config.ts": `export default { worker: {
				name: "alpha",
				entrypoint: "./index.js",
				compatibilityDate: "2025-12-02",
				env: {
					SELF_DO: { type: "durable-object", worker: "alpha", exportName: "Counter" },
					EXTERNAL_DO: { type: "durable-object", worker: "other-worker", exportName: "Counter" },
				},
			} };`,
				"index.js": "export default {}; export class Counter {}",
			});
			mockGetSettings();
			mockLastDeploymentRequest();
			msw.use(...mswListNewDeploymentsLatestFull);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const expectedBindings = [
				{
					name: "SELF_DO",
					type: "durable_object_namespace",
					class_name: "Counter",
					script_name: "alpha",
				},
				{
					name: "EXTERNAL_DO",
					type: "durable_object_namespace",
					class_name: "Counter",
					script_name: "other-worker",
				},
			];
			let uploads = 0;
			msw.use(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					async ({ request, params }) => {
						uploads++;
						expect(params.scriptName).toBe("test-name");
						// eslint-disable-next-line @typescript-eslint/no-deprecated -- parse the multipart upload in this test's mock API handler
						const form = await request.formData();
						const metadata = JSON.parse(
							await toString(form.get("metadata"))
						) as WorkerMetadata;
						expect(metadata.bindings).toEqual(expectedBindings);
						return HttpResponse.json(
							createFetchResult({
								id: "Galaxy-Class",
								startup_time_ms: 100,
								metadata: { has_preview: false },
								resources: { script: { etag: "test-etag" } },
							})
						);
					}
				)
			);

			await expect(runWrangler(command)).resolves.toBeUndefined();
			expect(uploads).toBe(1);
		}
	);

	it.for([
		{
			command: "deploy --experimental-new-config --name test-name --dry-run",
			ci: false,
		},
		{ command: "deploy --experimental-new-config --dry-run", ci: true },
		{
			command:
				"versions upload --experimental-new-config --name test-name --dry-run",
			ci: false,
		},
		{
			command: "versions upload --experimental-new-config --dry-run",
			ci: true,
		},
	])(
		"rejects containers whose binding targets the original name with $command (CI override: $ci)",
		async ({ command, ci }, { expect }) => {
			if (ci) {
				vi.stubEnv("WRANGLER_CI_OVERRIDE_NAME", "test-name");
			}
			await seed(selfBoundContainerFiles);

			await expect(runWrangler(command)).rejects.toThrow(
				"appears to be defined on the alpha Worker instead"
			);
		}
	);
});
