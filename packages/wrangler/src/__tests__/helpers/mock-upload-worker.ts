import { Blob } from "node:buffer";
import { MockedRequest, rest } from "msw";
import { FormData } from "undici";
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
			rest.put(
				"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
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

	async function handleUpload(
		req: RestRequest,
		res: ResponseComposition,
		ctx: RestContext
	) {
		expect(req.params.accountId).toEqual("some-account-id");
		expect(req.params.scriptName).toEqual(
			legacyEnv && env ? `test-name-${env}` : "test-name"
		);
		if (!legacyEnv) {
			expect(req.params.envName).toEqual(env);
		}
		expect(req.url.searchParams.get("include_subdomain_availability")).toEqual(
			"true"
		);
		expect(req.url.searchParams.get("excludeScript")).toEqual("true");

		const formBody = await (
			req as MockedRequest as RestRequestWithFormData
		).formData();
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
	expect(__formdata).toBeInstanceOf(Array);

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
