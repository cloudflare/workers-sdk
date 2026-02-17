import { ParseError } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { expect } from "vitest";
import {
	getSubdomainValues,
	getSubdomainValuesAPIMock,
} from "../../triggers/deploy";
import {
	mockGetWorkerSubdomain,
	mockUpdateWorkerSubdomain,
} from "./mock-workers-subdomain";
import { createFetchResult, msw } from "./msw";
import { serialize, toString } from "./serialize-form-data-entry";
import { readWranglerConfig } from "./write-wrangler-config";
import type { NonVersionedScriptSettings } from "../../versions/api";
import type {
	AssetConfigMetadata,
	CfWorkerInit,
	RawConfig,
	RawEnvironment,
	WorkerMetadata,
} from "@cloudflare/workers-utils";
import type { HttpResponseResolver } from "msw";

/** Create a mock handler for the request to upload a worker script. */
export function mockUploadWorkerRequest(
	options: {
		wranglerConfigPath?: string;
		expectedBaseUrl?: string;
		expectedEntry?: string | RegExp | ((entry: string | null) => void);
		expectedMainModule?: string;
		expectedType?: "esm" | "sw" | "none";
		expectedBindings?: unknown;
		expectedModules?: Record<string, string | null>;
		excludedModules?: string[];
		expectedCompatibilityDate?: string;
		expectedCompatibilityFlags?: string[];
		expectedMigrations?: CfWorkerInit["migrations"];
		expectedTailConsumers?: CfWorkerInit["tail_consumers"];
		expectedUnsafeMetaData?: Record<string, unknown>;
		expectedCapnpSchema?: string;
		expectedLimits?: CfWorkerInit["limits"];
		env?: string;
		useServiceEnvironments?: boolean;
		keepVars?: boolean;
		keepSecrets?: boolean;
		tag?: string;
		expectedDispatchNamespace?: string;
		expectedScriptName?: string;
		expectedAssets?: {
			jwt: string;
			config: AssetConfigMetadata;
		};
		useOldUploadApi?: boolean;
		expectedObservability?: CfWorkerInit["observability"];
		expectedSettingsPatch?: Partial<NonVersionedScriptSettings>;
		expectedContainers?: { class_name: string }[];
		expectedAnnotations?: Record<string, string | undefined>;
		expectedDeploymentMessage?: string;
	} = {}
) {
	const handleUpload: HttpResponseResolver = async ({ params, request }) => {
		const url = new URL(request.url);
		expect(url.hostname).toMatch(
			options.expectedBaseUrl ?? "api.cloudflare.com"
		);
		expect(params.accountId).toEqual("some-account-id");
		expect(params.scriptName).toEqual(expectedScriptName);
		if (useServiceEnvironments) {
			expect(params.envName).toEqual(env);
		}
		if (useOldUploadApi) {
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
			// Compare the provided bindings with the expected bindings, without requireing the order to match
			expect(metadata.bindings).toEqual(
				expect.arrayContaining(expectedBindings as unknown[])
			);
			expect(metadata.bindings?.length).toEqual(
				(expectedBindings as unknown[])?.length
			);
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
		if ("expectedContainers" in options) {
			expect(metadata.containers).toEqual(expectedContainers);
		}
		if ("expectedAnnotations" in options) {
			expect(metadata.annotations).toEqual(expectedAnnotations);
		}

		if (expectedUnsafeMetaData !== undefined) {
			Object.keys(expectedUnsafeMetaData).forEach((key) => {
				expect(metadata[key]).toEqual(expectedUnsafeMetaData[key]);
			});
		}
		for (const [name, content] of Object.entries(expectedModules)) {
			expect(await serialize(formBody.get(name))).toEqual(content);
		}
		for (const name of excludedModules) {
			expect(formBody.get(name)).toBeNull();
		}

		if (useOldUploadApi) {
			return HttpResponse.json(
				createFetchResult({
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
		expectedEntry,
		expectedAssets,
		// Allow setting expectedMainModule to undefined to test static-asset only uploads
		expectedMainModule = expectedAssets
			? options.expectedMainModule
			: "index.js",
		expectedType = "esm",
		expectedBindings,
		expectedModules = {},
		excludedModules = [],
		expectedCompatibilityDate,
		expectedCompatibilityFlags,
		env = undefined,
		useServiceEnvironments = true,
		expectedMigrations,
		expectedTailConsumers,
		expectedUnsafeMetaData,
		expectedCapnpSchema,
		expectedLimits,
		expectedContainers,
		expectedAnnotations,
		keepVars,
		keepSecrets,
		expectedDispatchNamespace,
		useOldUploadApi,
		expectedObservability,
		expectedSettingsPatch,
		expectedDeploymentMessage,
	} = options;

	const expectedScriptName =
		options.expectedScriptName ??
		"test-name" + (!useServiceEnvironments && env ? `-${env}` : "");

	if (env && useServiceEnvironments) {
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
				async ({ request }) => {
					if ("expectedDeploymentMessage" in options) {
						const body = (await request.json()) as {
							annotations?: { "workers/message"?: string };
						};
						expect(body.annotations?.["workers/message"]).toEqual(
							expectedDeploymentMessage
						);
					}
					return HttpResponse.json(createFetchResult({ id: "Deployment-ID" }));
				}
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
	// Every upload is followed by subdomain requests, to check and set subdomain status.
	// TODO: make this explicit by callers?
	let config: RawConfig = {};
	try {
		config = readWranglerConfig(options.wranglerConfigPath);
	} catch (e) {
		if (e instanceof ParseError) {
			// Ignore, config is either bad or doesn't exist.
		} else {
			throw e;
		}
	}
	let envConfig: RawEnvironment = config;
	if (env) {
		envConfig = config.env?.[env] ?? {};
	}
	const subdomainDefaults = getSubdomainValuesAPIMock(
		envConfig.workers_dev,
		envConfig.preview_urls,
		envConfig.routes ?? []
	);
	mockGetWorkerSubdomain({
		enabled: subdomainDefaults.workers_dev,
		previews_enabled: subdomainDefaults.preview_urls,
		env,
		useServiceEnvironments,
		expectedScriptName,
	});
	const subdomainValues = getSubdomainValues(
		envConfig.workers_dev,
		envConfig.preview_urls,
		envConfig.routes ?? []
	);
	mockUpdateWorkerSubdomain({
		enabled: subdomainValues.workers_dev,
		previews_enabled: subdomainValues.preview_urls,
		response: {
			enabled: subdomainDefaults.workers_dev,
			previews_enabled: subdomainDefaults.preview_urls,
		},
		env,
		useServiceEnvironments,
		expectedScriptName,
	});
}
