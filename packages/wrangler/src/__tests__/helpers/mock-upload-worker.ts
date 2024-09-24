import { http, HttpResponse } from "msw";
import { createFetchResult, msw } from "./msw";
import { serialize, toString } from "./serialize-form-data-entry";
import type { WorkerMetadata } from "../../deployment-bundle/create-worker-upload-form";
import type { CfWorkerInit } from "../../deployment-bundle/worker";
import type { NonVersionedScriptSettings } from "../../versions/api";
import type { AssetConfig } from "@cloudflare/workers-shared";
import type { HttpResponseResolver } from "msw";

/** Create a mock handler for the request to upload a worker script. */
export function mockUploadWorkerRequest(
	options: {
		available_on_subdomain?: boolean;
		expectedEntry?: string | RegExp | ((entry: string | null) => void);
		expectedMainModule?: string;
		expectedType?: "esm" | "sw" | "none";
		expectedBindings?: unknown;
		expectedModules?: Record<string, string | null>;
		expectedCompatibilityDate?: string;
		expectedCompatibilityFlags?: string[];
		expectedMigrations?: CfWorkerInit["migrations"];
		expectedTailConsumers?: CfWorkerInit["tail_consumers"];
		expectedUnsafeMetaData?: Record<string, unknown>;
		expectedCapnpSchema?: string;
		expectedLimits?: CfWorkerInit["limits"];
		env?: string;
		legacyEnv?: boolean;
		keepVars?: boolean;
		keepSecrets?: boolean;
		tag?: string;
		expectedDispatchNamespace?: string;
		expectedScriptName?: string;
		expectedAssets?: {
			jwt: string;
			config: AssetConfig;
		};
		useOldUploadApi?: boolean;
		expectedObservability?: CfWorkerInit["observability"];
		expectedSettingsPatch?: Partial<NonVersionedScriptSettings>;
	} = {}
) {
	const expectedScriptName = (options.expectedScriptName ??= "test-name");
	const handleUpload: HttpResponseResolver = async ({ params, request }) => {
		const url = new URL(request.url);
		expect(params.accountId).toEqual("some-account-id");
		expect(params.scriptName).toEqual(
			legacyEnv && env ? `${expectedScriptName}-${env}` : expectedScriptName
		);
		if (!legacyEnv) {
			expect(params.envName).toEqual(env);
		}
		if (useOldUploadApi) {
			expect(url.searchParams.get("include_subdomain_availability")).toEqual(
				"true"
			);
			expect(url.searchParams.get("excludeScript")).toEqual("true");
		}
		if (expectedDispatchNamespace) {
			expect(params.dispatchNamespace).toEqual(expectedDispatchNamespace);
		}

		const formBody = await request.formData();
		if (typeof expectedEntry === "string" || expectedEntry instanceof RegExp) {
			expect(await serialize(formBody.get("index.js"))).toMatch(expectedEntry);
		} else if (typeof expectedEntry === "function") {
			expectedEntry(await serialize(formBody.get("index.js")));
		}
		const metadata = JSON.parse(
			await toString(formBody.get("metadata"))
		) as WorkerMetadata;

		if (expectedType === "esm") {
			expect(metadata.main_module).toEqual(expectedMainModule);
		} else if (expectedType === "none") {
			expect(metadata.main_module).toEqual(undefined);
		} else {
			expect(metadata.body_part).toEqual("index.js");
		}

		if (keepVars) {
			expect(metadata.keep_bindings).toEqual(
				expect.arrayContaining(["plain_text", "json"])
			);
		} else if (keepSecrets) {
			expect(metadata.keep_bindings).toEqual(
				expect.arrayContaining(["secret_text", "secret_key"])
			);
		} else {
			expect(metadata.keep_bindings).toBeFalsy();
		}

		if ("expectedBindings" in options) {
			expect(metadata.bindings).toEqual(expectedBindings);
		}
		if ("expectedCompatibilityDate" in options) {
			expect(metadata.compatibility_date).toEqual(expectedCompatibilityDate);
		}
		if ("expectedCompatibilityFlags" in options) {
			expect(metadata.compatibility_flags).toEqual(expectedCompatibilityFlags);
		}
		if ("expectedMigrations" in options) {
			expect(metadata.migrations).toEqual(expectedMigrations);
		}
		if ("expectedTailConsumers" in options) {
			expect(metadata.tail_consumers).toEqual(expectedTailConsumers);
		}
		if ("expectedCapnpSchema" in options) {
			expect(
				await serialize(formBody.get(metadata.capnp_schema ?? ""))
			).toEqual(expectedCapnpSchema);
		}
		if ("expectedLimits" in options) {
			expect(metadata.limits).toEqual(expectedLimits);
		}
		if ("expectedAssets" in options) {
			expect(metadata.assets).toEqual(expectedAssets);
		}
		if ("expectedObservability" in options) {
			expect(metadata.observability).toEqual(expectedObservability);
		}
		if (expectedUnsafeMetaData !== undefined) {
			Object.keys(expectedUnsafeMetaData).forEach((key) => {
				expect(metadata[key]).toEqual(expectedUnsafeMetaData[key]);
			});
		}
		for (const [name, content] of Object.entries(expectedModules)) {
			expect(await serialize(formBody.get(name))).toEqual(content);
		}

		if (useOldUploadApi) {
			return HttpResponse.json(
				createFetchResult({
					available_on_subdomain,
					id: "abc12345",
					etag: "etag98765",
					pipeline_hash: "hash9999",
					mutable_pipeline_id: "mutableId",
					tag: "sample-tag",
					deployment_id: "Galaxy-Class",
					startup_time_ms: 100,
				})
			);
		}

		return HttpResponse.json(
			createFetchResult({
				id: "Galaxy-Class",
				startup_time_ms: 100,
				resources: {
					script: {
						etag: "etag98765",
					},
				},
			})
		);
	};

	const {
		available_on_subdomain = true,
		expectedEntry,
		expectedAssets,
		// Allow setting expectedMainModule to undefined to test static-asset only uploads
		expectedMainModule = expectedAssets
			? options.expectedMainModule
			: "index.js",
		expectedType = "esm",
		expectedBindings,
		expectedModules = {},
		expectedCompatibilityDate,
		expectedCompatibilityFlags,
		env = undefined,
		legacyEnv = false,
		expectedMigrations,
		expectedTailConsumers,
		expectedUnsafeMetaData,
		expectedCapnpSchema,
		expectedLimits,
		keepVars,
		keepSecrets,
		expectedDispatchNamespace,
		useOldUploadApi,
		expectedObservability,
		expectedSettingsPatch,
	} = options;
	if (env && !legacyEnv) {
		msw.use(
			http.put(
				"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
				handleUpload
			)
		);
	} else if (expectedDispatchNamespace) {
		msw.use(
			http.put(
				"*/accounts/:accountId/workers/dispatch/namespaces/:dispatchNamespace/scripts/:scriptName",
				handleUpload
			)
		);
	} else if (useOldUploadApi) {
		msw.use(
			http.put(
				"*/accounts/:accountId/workers/scripts/:scriptName",
				handleUpload
			)
		);
	} else {
		msw.use(
			http.post(
				"*/accounts/:accountId/workers/scripts/:scriptName/versions",
				handleUpload
			),
			http.post(
				"*/accounts/:accountId/workers/scripts/:scriptName/deployments",
				() => HttpResponse.json(createFetchResult({ id: "Deployment-ID" }))
			),
			http.patch(
				"*/accounts/:accountId/workers/scripts/:scriptName/script-settings",
				async ({ request }) => {
					const body = await request.json();

					if ("expectedSettingsPatch" in options) {
						expect(body).toEqual(expectedSettingsPatch);
					}

					return HttpResponse.json(createFetchResult({}));
				}
			)
		);
	}

	msw.use(
		http.get(
			env && !legacyEnv
				? `*/accounts/:accountId/workers/services/:scriptName/environments/:envName/subdomain`
				: `*/accounts/:accountId/workers/scripts/:scriptName/subdomain`,
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					legacyEnv && env ? `${expectedScriptName}-${env}` : expectedScriptName
				);
				if (!legacyEnv) {
					expect(params.envName).toEqual(env);
				}

				return HttpResponse.json(
					createFetchResult({ enabled: available_on_subdomain })
				);
			}
		)
	);
}
