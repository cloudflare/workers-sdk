import { Blob } from "node:buffer";
import { MockedRequest, rest } from "msw";
import { FormData } from "undici";
import { assert } from "vitest";
import { createFetchResult, msw } from "./msw";
import { FileReaderSync } from "./msw/read-file-sync";
import type { WorkerMetadata } from "../../deployment-bundle/create-worker-upload-form";
import type { CfWorkerInit } from "../../deployment-bundle/worker";
import type { ResponseComposition, RestContext, RestRequest } from "msw";

/** Create a mock handler for the request to upload a worker script. */
export function mockUploadWorkerRequest(
	options: {
		available_on_subdomain?: boolean;
		expectedEntry?: string | RegExp;
		expectedMainModule?: string;
		expectedType?: "esm" | "sw";
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
	} = {}
) {
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
		keepSecrets,
		expectedDispatchNamespace,
	} = options;
	if (env && !legacyEnv) {
		msw.use(
			rest.put(
				"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
				handleUpload
			)
		);
	} else if (expectedDispatchNamespace) {
		msw.use(
			rest.put(
				"*/accounts/:accountId/workers/dispatch/namespaces/:dispatchNamespace/scripts/:scriptName",
				handleUpload
			)
		);
	} else {
		msw.use(
			rest.put(
				"*/accounts/:accountId/workers/scripts/:scriptName",
				handleUpload
			)
		);
	}

	msw.use(
		rest.get(
			env && !legacyEnv
				? `*/accounts/:accountId/workers/services/:scriptName/environments/:envName/subdomain`
				: `*/accounts/:accountId/workers/scripts/:scriptName/subdomain`,
			(req, res, ctx) => {
				assert(req.params.accountId == "some-account-id");
				assert(
					req.params.scriptName ==
						(legacyEnv && env ? `test-name-${env}` : "test-name")
				);
				if (!legacyEnv) {
					assert(req.params.envName == env);
				}

				return res(
					ctx.json(createFetchResult({ enabled: available_on_subdomain }))
				);
			}
		)
	);

	async function handleUpload(
		req: RestRequest,
		res: ResponseComposition,
		ctx: RestContext
	) {
		assert(req.params.accountId == "some-account-id");
		assert(
			req.params.scriptName ==
				(legacyEnv && env ? `test-name-${env}` : "test-name")
		);
		if (!legacyEnv) {
			assert(req.params.envName == env);
		}
		assert(
			req.url.searchParams.get("include_subdomain_availability") == "true"
		);
		assert(req.url.searchParams.get("excludeScript") == "true");
		if (expectedDispatchNamespace) {
			assert(req.params.dispatchNamespace == expectedDispatchNamespace);
		}

		const formBody = await (
			req as MockedRequest as RestRequestWithFormData
		).formData();
		if (expectedEntry !== undefined) {
			const indexJs = formBody.get("index.js") as string;
			assert.match(indexJs, new RegExp(expectedEntry));
		}
		const metadata = JSON.parse(
			formBody.get("metadata") as string
		) as WorkerMetadata;
		if (expectedType === "esm") {
			assert(metadata.main_module == expectedMainModule);
		} else {
			assert(metadata.body_part == "index.js");
		}

		if (keepVars) {
			assert.containSubset(metadata.keep_bindings, ["plain_text", "json"]);
		} else if (keepSecrets) {
			assert.containSubset(metadata.keep_bindings, [
				"secret_text",
				"secret_key",
			]);
		} else {
			assert.isFalse(metadata.keep_bindings);
		}

		if ("expectedBindings" in options) {
			assert(metadata.bindings == expectedBindings);
		}
		if ("expectedCompatibilityDate" in options) {
			assert(metadata.compatibility_date == expectedCompatibilityDate);
		}
		if ("expectedCompatibilityFlags" in options) {
			assert(metadata.compatibility_flags == expectedCompatibilityFlags);
		}
		if ("expectedMigrations" in options) {
			assert(metadata.migrations == expectedMigrations);
		}
		if ("expectedTailConsumers" in options) {
			assert(metadata.tail_consumers == expectedTailConsumers);
		}
		if ("expectedCapnpSchema" in options) {
			assert(formBody.get(metadata.capnp_schema ?? "") == expectedCapnpSchema);
		}
		if ("expectedLimits" in options) {
			assert(metadata.limits == expectedLimits);
		}
		if (expectedUnsafeMetaData !== undefined) {
			Object.keys(expectedUnsafeMetaData).forEach((key) => {
				assert(metadata[key] == expectedUnsafeMetaData[key]);
			});
		}
		for (const [name, content] of Object.entries(expectedModules)) {
			assert(formBody.get(name) == content);
		}

		return res(
			ctx.json(
				createFetchResult({
					available_on_subdomain,
					id: "abc12345",
					etag: "etag98765",
					pipeline_hash: "hash9999",
					mutable_pipeline_id: "mutableId",
					tag: "sample-tag",
					deployment_id: "Galaxy-Class",
				})
			)
		);
	}
}

// MSW FormData & Blob polyfills to test FormData requests
function mockFormDataToString(this: FormData) {
	const entries = [];
	for (const [key, value] of this.entries()) {
		if (value instanceof Blob) {
			const reader = new FileReaderSync();
			reader.readAsText(value);
			const result = reader.result;
			entries.push([key, result]);
		} else {
			entries.push([key, value]);
		}
	}
	return JSON.stringify({
		__formdata: entries,
	});
}

async function mockFormDataFromString(this: MockedRequest): Promise<FormData> {
	const { __formdata } = await this.json();
	assert(__formdata instanceof Array);

	const form = new FormData();
	for (const [key, value] of __formdata) {
		form.set(key, value);
	}
	return form;
}

// The following two functions workaround the fact that MSW does not yet support FormData in requests.
// We use the fact that MSW relies upon `node-fetch` internally, which will call `toString()` on the FormData object,
// rather than passing it through or serializing it as a proper FormData object.
// The hack is to serialize FormData to a JSON string by overriding `FormData.toString()`.
// And then to deserialize back to a FormData object by monkey-patching a `formData()` helper onto `MockedRequest`.
FormData.prototype.toString = mockFormDataToString;
export interface RestRequestWithFormData extends MockedRequest, RestRequest {
	formData(): Promise<FormData>;
}
(MockedRequest.prototype as RestRequestWithFormData).formData =
	mockFormDataFromString;
