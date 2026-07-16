import { http, HttpResponse } from "msw";
import { FormData } from "undici";
import { createFetchResult, msw } from "../../helpers/msw";
import type { VersionDetails, WorkerVersion } from "../../../versions/secrets";
import type { WorkerMetadata } from "@cloudflare/workers-utils";
import type { ExpectStatic } from "vitest";

function mockGetVersions(expect: ExpectStatic) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
			async ({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toMatch(/script-name(-test)?/);

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

export function mockGetVersion(
	expect: ExpectStatic,
	versionInfo?: VersionDetails
) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/scripts/:scriptName/versions/ce15c78b-cc43-4f60-b5a9-15ce4f298c2a`,
			async ({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toMatch(/script-name(-test)?/);

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
									{
										name: "do-binding",
										type: "durable_object_namespace",
										namespace_id: "some-namespace-id",
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

function mockGetVersionContent(
	expect: ExpectStatic,
	options?: { capnpSchema?: { name: string; content: string } }
) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/scripts/:scriptName/content/v2`,
			async ({ params, request }) => {
				const url = new URL(request.url);
				expect(url.searchParams.get("version")).toEqual(
					"ce15c78b-cc43-4f60-b5a9-15ce4f298c2a"
				);
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toMatch(/script-name(-test)?/);

				const formData = new FormData();
				formData.set(
					"index.js",
					new File(["export default {}"], "index.js", {
						type: "application/javascript+module",
					}),
					"index.js"
				);

				const headers: Record<string, string> = { "cf-entrypoint": "index.js" };

				if (options?.capnpSchema) {
					formData.set(
						options.capnpSchema.name,
						new File([options.capnpSchema.content], options.capnpSchema.name, {
							type: "application/octet-stream",
						}),
						options.capnpSchema.name
					);
					headers["cf-worker-capnp-schema-part"] = options.capnpSchema.name;
				}

				return HttpResponse.formData(formData, { headers });
			},
			{ once: true }
		)
	);
}

function mockGetWorkerSettings(expect: ExpectStatic) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/scripts/:scriptName/script-settings`,
			async ({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toMatch(/script-name(-test)?/);

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

export function mockPostVersion(
	expect: ExpectStatic,
	validate?: (metadata: WorkerMetadata, formData: FormData) => void
) {
	msw.use(
		http.post(
			`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toMatch(/script-name(-test)?/);

				// eslint-disable-next-line @typescript-eslint/no-deprecated -- formData() is the standard Web API; only deprecated on undici's server-side types
				const formData = await request.formData();
				const metadata = JSON.parse(
					formData.get("metadata") as string
				) as WorkerMetadata;

				if (validate) {
					validate(metadata, formData);
				}

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

export function mockSetupApiCalls(
	expect: ExpectStatic,
	options?: { capnpSchema?: { name: string; content: string } }
) {
	mockGetVersions(expect);
	mockGetVersion(expect);
	mockGetVersionContent(expect, options);
	mockGetWorkerSettings(expect);
}
