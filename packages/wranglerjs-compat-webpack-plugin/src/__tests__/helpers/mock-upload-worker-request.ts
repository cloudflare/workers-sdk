import { setMockResponse } from "wrangler/src/__tests__/helpers/mock-cfetch";
import type { FormData, File } from "undici";
import type { WorkerMetadata } from "wrangler/src/create-worker-upload-form";
import type { CfWorkerInit } from "wrangler/src/worker";

/** Create a mock handler for the request to upload a worker script. */
export function mockUploadWorkerRequest(
	options: {
		available_on_subdomain?: boolean;
		expectedEntry?: string;
		expectedType?: "esm" | "sw";
		expectedBindings?: unknown;
		expectedModules?: Record<string, string>;
		expectedCompatibilityDate?: string;
		expectedCompatibilityFlags?: string[];
		expectedMigrations?: CfWorkerInit["migrations"];
		env?: string;
		legacyEnv?: boolean;
		expectedName?: string;
	} = {}
) {
	const {
		available_on_subdomain = true,
		expectedEntry,
		expectedType = "esm",
		expectedBindings,
		expectedModules = {},
		expectedCompatibilityDate,
		expectedCompatibilityFlags,
		env = undefined,
		legacyEnv = false,
		expectedMigrations,
		expectedName = "index.js",
	} = options;
	setMockResponse(
		env && !legacyEnv
			? "/accounts/:accountId/workers/services/:scriptName/environments/:envName"
			: "/accounts/:accountId/workers/scripts/:scriptName",
		"PUT",
		async ([_url, accountId, scriptName, envName], { body }, queryParams) => {
			expect(accountId).toEqual("some-account-id");
			expect(scriptName).toEqual(
				legacyEnv && env ? `test-name-${env}` : "test-name"
			);
			if (!legacyEnv) {
				expect(envName).toEqual(env);
			}
			expect(queryParams.get("available_on_subdomain")).toEqual("true");
			const formBody = body as FormData;
			if (expectedEntry !== undefined) {
				expect(await (formBody.get(expectedName) as File).text()).toMatch(
					expectedEntry
				);
			}
			const metadata = JSON.parse(
				formBody.get("metadata") as string
			) as WorkerMetadata;
			if (expectedType === "esm") {
				expect(metadata.main_module).toEqual(expectedName);
			} else {
				expect(metadata.body_part).toEqual(expectedName);
			}
			if ("expectedBindings" in options) {
				expect(metadata.bindings).toEqual(expectedBindings);
			}
			if ("expectedCompatibilityDate" in options) {
				expect(metadata.compatibility_date).toEqual(expectedCompatibilityDate);
			}
			if ("expectedCompatibilityFlags" in options) {
				expect(metadata.compatibility_flags).toEqual(
					expectedCompatibilityFlags
				);
			}
			if ("expectedMigrations" in options) {
				expect(metadata.migrations).toEqual(expectedMigrations);
			}
			for (const [name, content] of Object.entries(expectedModules)) {
				expect(await (formBody.get(name) as File).text()).toEqual(content);
			}

			return { available_on_subdomain };
		}
	);
}
