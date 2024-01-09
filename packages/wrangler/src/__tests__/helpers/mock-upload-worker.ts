import { http, HttpResponse } from "msw";
import { createFetchResult, msw } from "./msw";

import type { WorkerMetadata } from "../../deployment-bundle/create-worker-upload-form";
import type { CfWorkerInit } from "../../deployment-bundle/worker";
import type { ResponseResolver, PathParams } from "msw";

/** Create a mock handler for the request to upload a worker script. */
export function mockUploadWorkerRequest(
	options: {
		available_on_subdomain?: boolean;
		expectedEntry?: string | RegExp;
		expectedMainModule?: string;
		expectedType?: "esm" | "sw";
		expectedBindings?: unknown;
		expectedModules?: Record<string, string>;
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
		tag?: string;
	} = {}
) {
	const handleUpload: /**
	 * @todo This type annotation is not ideal.
	 * @see https://github.com/mswjs/msw/issues/1955
	 */
	ResponseResolver<{ params: PathParams }> = async ({ request, params }) => {
		expect(params.accountId).toEqual("some-account-id");
		expect(params.scriptName).toEqual(
			legacyEnv && env ? `test-name-${env}` : "test-name"
		);
		if (!legacyEnv) {
			expect(params.envName).toEqual(env);
		}

		const url = new URL(request.url);
		expect(url.searchParams.get("include_subdomain_availability")).toEqual(
			"true"
		);
		expect(url.searchParams.get("excludeScript")).toEqual("true");

		const formBody = await request.formData();
		if (expectedEntry !== undefined) {
			expect(formBody.get("index.js")).toMatch(expectedEntry);
		}
		const metadata = JSON.parse(
			formBody.get("metadata") as string
		) as WorkerMetadata;
		if (expectedType === "esm") {
			expect(metadata.main_module).toEqual(expectedMainModule);
		} else {
			expect(metadata.body_part).toEqual("index.js");
		}

		if (keepVars) {
			expect(metadata.keep_bindings).toEqual(["plain_text", "json"]);
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
			expect(formBody.get(metadata.capnp_schema ?? "")).toEqual(
				expectedCapnpSchema
			);
		}
		if ("expectedLimits" in options) {
			expect(metadata.limits).toEqual(expectedLimits);
		}
		if (expectedUnsafeMetaData !== undefined) {
			Object.keys(expectedUnsafeMetaData).forEach((key) => {
				expect(metadata[key]).toEqual(expectedUnsafeMetaData[key]);
			});
		}
		for (const [name, content] of Object.entries(expectedModules)) {
			expect(formBody.get(name)).toEqual(content);
		}

		return HttpResponse.json(
			createFetchResult({
				available_on_subdomain,
				id: "abc12345",
				etag: "etag98765",
				pipeline_hash: "hash9999",
				mutable_pipeline_id: "mutableId",
				tag: "sample-tag",
				deployment_id: "Galaxy-Class",
			})
		);
	};

	const {
		available_on_subdomain = true,
		expectedEntry,
		expectedMainModule = "index.js",
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
	} = options;
	if (env && !legacyEnv) {
		msw.use(
			http.put(
				"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
				handleUpload
			)
		);
	} else {
		msw.use(
			http.put(
				"*/accounts/:accountId/workers/scripts/:scriptName",
				handleUpload
			)
		);
	}
}
