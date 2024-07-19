import { http, HttpResponse } from "msw";
import { File, FormData } from "undici";
import { createFetchResult, msw } from "../../helpers/msw";
import type { WorkerMetadata } from "../../../deployment-bundle/create-worker-upload-form";
import type { VersionDetails, WorkerVersion } from "../../../versions/secrets";

export function mockGetVersions() {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
			async ({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual("script-name");

				return HttpResponse.json(
					createFetchResult({
						items: [
							{
								id: "ce15c78b-cc43-4f60-b5a9-15ce4f298c2a",
								number: 2,
							},
							{
								id: "ec5ea4f9-fe32-4301-bd73-6a86006ae8d4",
								number: 1,
							},
						] as WorkerVersion[],
					})
				);
			},
			{ once: true }
		)
	);
}

export function mockGetVersion(versionInfo?: VersionDetails) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/scripts/:scriptName/versions/ce15c78b-cc43-4f60-b5a9-15ce4f298c2a`,
			async ({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual("script-name");

				return HttpResponse.json(
					createFetchResult(
						versionInfo ?? {
							id: "ce15c78b-cc43-4f60-b5a9-15ce4f298c2a",
							metadata: {},
							number: 2,
							resources: {
								bindings: [
									{ type: "secret_text", name: "SECRET", text: "Secret shhh" },
									{
										type: "secret_text",
										name: "ANOTHER_SECRET",
										text: "Another secret shhhh",
									},
									{
										type: "secret_text",
										name: "YET_ANOTHER_SECRET",
										text: "Yet another secret shhhhh",
									},
								],
								script: {
									etag: "etag",
									handlers: ["fetch"],
									last_deployed_from: "api",
								},
								script_runtime: {
									usage_model: "standard",
									limits: {},
								},
							},
						}
					)
				);
			},
			{ once: true }
		)
	);
}

export function mockGetVersionContent() {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/scripts/:scriptName/content/v2?version=ce15c78b-cc43-4f60-b5a9-15ce4f298c2a`,
			async ({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual("script-name");

				const formData = new FormData();
				formData.set(
					"index.js",
					new File(["export default {}"], "index.js", {
						type: "application/javascript+module",
					}),
					"index.js"
				);

				return HttpResponse.formData(formData, {
					headers: { "cf-entrypoint": "index.js" },
				});
			},
			{ once: true }
		)
	);
}

export function mockGetWorkerSettings() {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/scripts/:scriptName/script-settings`,
			async ({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual("script-name");

				return HttpResponse.json(
					createFetchResult({
						logpush: false,
						tail_consumers: null,
					})
				);
			},
			{ once: true }
		)
	);
}

export function mockPostVersion(validate?: (metadata: WorkerMetadata) => void) {
	msw.use(
		http.post(
			`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual("script-name");

				const formData = await request.formData();
				const metadata = JSON.parse(
					formData.get("metadata") as string
				) as WorkerMetadata;

				validate && validate(metadata);

				return HttpResponse.json(
					createFetchResult({
						id: "id",
						etag: "etag",
						deployment_id: "version-id",
					})
				);
			},
			{ once: true }
		)
	);
}

export function mockSetupApiCalls() {
	mockGetVersions();
	mockGetVersion();
	mockGetVersionContent();
	mockGetWorkerSettings();
}
