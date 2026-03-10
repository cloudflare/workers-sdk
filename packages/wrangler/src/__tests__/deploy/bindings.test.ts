/* eslint-disable workers-sdk/no-vitest-import-expect */

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { sync } from "command-exists";
import { http, HttpResponse } from "msw";
import * as TOML from "smol-toml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockLegacyScriptData } from "../helpers/mock-legacy-script";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
} from "./helpers";
import type { Mock } from "vitest";

vi.mock("command-exists");
vi.mock("../../check/commands", async (importOriginal) => {
	return {
		...(await importOriginal()),
		analyseBundle() {
			return `{}`;
		},
	};
});

vi.mock("../../utils/fetch-secrets");

vi.mock("../../package-manager", async (importOriginal) => ({
	...(await importOriginal()),
	sniffUserAgent: () => "npm",
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

vi.mock("../../autoconfig/run");
vi.mock("../../autoconfig/frameworks/utils/packages");
vi.mock("../../autoconfig/c3-vendor/command");

describe("deploy", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.stubGlobal("setTimeout", (fn: () => void) => {
			setImmediate(fn);
		});
		setIsTTY(true);
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		mockPatchScriptSettings();
		mockGetSettings();
		msw.use(...mswListNewDeploymentsLatestFull);
		// Pretend all R2 buckets exist for the purposes of deployment testing.
		// Otherwise, wrangler deploy would try to provision them. The provisioning
		// behaviour is tested in provision.test.ts
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets/:bucketName", async () => {
				return HttpResponse.json(createFetchResult({}));
			})
		);
		vi.mocked(fetchSecrets).mockResolvedValue([]);
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	describe("bindings", () => {
		it("should allow bindings with different names", async () => {
			writeWranglerConfig({
				migrations: [
					{
						tag: "v1",
						new_classes: ["SomeDurableObject", "AnotherDurableObject"],
					},
				],
				durable_objects: {
					bindings: [
						{
							name: "DURABLE_OBJECT_ONE",
							class_name: "SomeDurableObject",
							script_name: "some-durable-object-worker",
						},
						{
							name: "DURABLE_OBJECT_TWO",
							class_name: "AnotherDurableObject",
							script_name: "another-durable-object-worker",
							environment: "staging",
						},
					],
				},
				kv_namespaces: [
					{ binding: "KV_NAMESPACE_ONE", id: "kv-ns-one-id" },
					{ binding: "KV_NAMESPACE_TWO", id: "kv-ns-two-id" },
				],
				r2_buckets: [
					{ binding: "R2_BUCKET_ONE", bucket_name: "r2-bucket-one-name" },
					{ binding: "R2_BUCKET_TWO", bucket_name: "r2-bucket-two-name" },
					{
						binding: "R2_BUCKET_ONE_EU",
						bucket_name: "r2-bucket-one-name",
						jurisdiction: "eu",
					},
					{
						binding: "R2_BUCKET_TWO_EU",
						bucket_name: "r2-bucket-two-name",
						jurisdiction: "eu",
					},
				],
				analytics_engine_datasets: [
					{ binding: "AE_DATASET_ONE", dataset: "ae-dataset-one-name" },
					{ binding: "AE_DATASET_TWO", dataset: "ae-dataset-two-name" },
				],
				text_blobs: {
					TEXT_BLOB_ONE: "./my-entire-app-depends-on-this.cfg",
					TEXT_BLOB_TWO: "./the-entirety-of-human-knowledge.txt",
				},
				unsafe: {
					bindings: [
						{
							name: "UNSAFE_BINDING_ONE",
							type: "some unsafe thing",
							data: { some: { unsafe: "thing" } },
						},
						{
							name: "UNSAFE_BINDING_TWO",
							type: "another unsafe thing",
							data: 1337,
						},
					],
					metadata: {
						extra_data: "interesting value",
						more_data: "dubious value",
					},
				},
				vars: {
					ENV_VAR_ONE: 123,
					ENV_VAR_TWO: "Hello, I'm an environment variable",
				},
				wasm_modules: {
					WASM_MODULE_ONE: "./some_wasm.wasm",
					WASM_MODULE_TWO: "./more_wasm.wasm",
				},
				data_blobs: {
					DATA_BLOB_ONE: "./some-data-blob.bin",
					DATA_BLOB_TWO: "./more-data-blob.bin",
				},
				logfwdr: {
					bindings: [
						{
							name: "httplogs",
							destination: "httplogs",
						},
						{
							name: "trace",
							destination: "trace",
						},
					],
				},
			});

			writeWorkerSource({ type: "sw" });
			fs.writeFileSync("./my-entire-app-depends-on-this.cfg", "config = value");
			fs.writeFileSync(
				"./the-entirety-of-human-knowledge.txt",
				"Everything's bigger in Texas"
			);
			fs.writeFileSync("./some_wasm.wasm", "some wasm");
			fs.writeFileSync("./more_wasm.wasm", "more wasm");

			fs.writeFileSync("./some-data-blob.bin", "some data");
			fs.writeFileSync("./more-data-blob.bin", "more data");

			mockUploadWorkerRequest({
				expectedType: "sw",
				expectedUnsafeMetaData: {
					extra_data: "interesting value",
					more_data: "dubious value",
				},
				expectedBindings: [
					{ json: 123, name: "ENV_VAR_ONE", type: "json" },
					{
						name: "ENV_VAR_TWO",
						text: "Hello, I'm an environment variable",
						type: "plain_text",
					},
					{
						name: "KV_NAMESPACE_ONE",
						namespace_id: "kv-ns-one-id",
						type: "kv_namespace",
					},
					{
						name: "KV_NAMESPACE_TWO",
						namespace_id: "kv-ns-two-id",
						type: "kv_namespace",
					},
					{
						class_name: "SomeDurableObject",
						name: "DURABLE_OBJECT_ONE",
						script_name: "some-durable-object-worker",
						type: "durable_object_namespace",
					},
					{
						class_name: "AnotherDurableObject",
						environment: "staging",
						name: "DURABLE_OBJECT_TWO",
						script_name: "another-durable-object-worker",
						type: "durable_object_namespace",
					},
					{
						bucket_name: "r2-bucket-one-name",
						name: "R2_BUCKET_ONE",
						type: "r2_bucket",
					},
					{
						bucket_name: "r2-bucket-two-name",
						name: "R2_BUCKET_TWO",
						type: "r2_bucket",
					},
					{
						bucket_name: "r2-bucket-one-name",
						jurisdiction: "eu",
						name: "R2_BUCKET_ONE_EU",
						type: "r2_bucket",
					},
					{
						bucket_name: "r2-bucket-two-name",
						jurisdiction: "eu",
						name: "R2_BUCKET_TWO_EU",
						type: "r2_bucket",
					},
					{
						dataset: "ae-dataset-one-name",
						name: "AE_DATASET_ONE",
						type: "analytics_engine",
					},
					{
						dataset: "ae-dataset-two-name",
						name: "AE_DATASET_TWO",
						type: "analytics_engine",
					},
					{
						name: "httplogs",
						type: "logfwdr",
						destination: "httplogs",
					},
					{
						name: "trace",
						type: "logfwdr",
						destination: "trace",
					},
					{
						name: "WASM_MODULE_ONE",
						part: "WASM_MODULE_ONE",
						type: "wasm_module",
					},
					{
						name: "WASM_MODULE_TWO",
						part: "WASM_MODULE_TWO",
						type: "wasm_module",
					},
					{ name: "TEXT_BLOB_ONE", part: "TEXT_BLOB_ONE", type: "text_blob" },
					{ name: "TEXT_BLOB_TWO", part: "TEXT_BLOB_TWO", type: "text_blob" },
					{ name: "DATA_BLOB_ONE", part: "DATA_BLOB_ONE", type: "data_blob" },
					{ name: "DATA_BLOB_TWO", part: "DATA_BLOB_TWO", type: "data_blob" },
					{
						data: { some: { unsafe: "thing" } },
						name: "UNSAFE_BINDING_ONE",
						type: "some unsafe thing",
					},
					{
						data: 1337,
						name: "UNSAFE_BINDING_TWO",
						type: "another unsafe thing",
					},
				],
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			mockLegacyScriptData({ scripts: [] });

			await expect(runWrangler("deploy index.js")).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                                                                      Resource
				env.DATA_BLOB_ONE (some-data-blob.bin)                                                       Data Blob
				env.DATA_BLOB_TWO (more-data-blob.bin)                                                       Data Blob
				env.DURABLE_OBJECT_ONE (SomeDurableObject, defined in some-durable-object-worker)            Durable Object
				env.DURABLE_OBJECT_TWO (AnotherDurableObject, defined in another-durable-object-worker)      Durable Object
				env.KV_NAMESPACE_ONE (kv-ns-one-id)                                                          KV Namespace
				env.KV_NAMESPACE_TWO (kv-ns-two-id)                                                          KV Namespace
				env.R2_BUCKET_ONE (r2-bucket-one-name)                                                       R2 Bucket
				env.R2_BUCKET_TWO (r2-bucket-two-name)                                                       R2 Bucket
				env.R2_BUCKET_ONE_EU (r2-bucket-one-name (eu))                                               R2 Bucket
				env.R2_BUCKET_TWO_EU (r2-bucket-two-name (eu))                                               R2 Bucket
				env.httplogs (httplogs)                                                                      logfwdr
				env.trace (trace)                                                                            logfwdr
				env.AE_DATASET_ONE (ae-dataset-one-name)                                                     Analytics Engine Dataset
				env.AE_DATASET_TWO (ae-dataset-two-name)                                                     Analytics Engine Dataset
				env.TEXT_BLOB_ONE (my-entire-app-depends-on-this.cfg)                                        Text Blob
				env.TEXT_BLOB_TWO (the-entirety-of-human-knowledge.txt)                                      Text Blob
				env.UNSAFE_BINDING_ONE (some unsafe thing)                                                   Unsafe Metadata
				env.UNSAFE_BINDING_TWO (another unsafe thing)                                                Unsafe Metadata
				env.ENV_VAR_ONE (123)                                                                        Environment Variable
				env.ENV_VAR_TWO ("Hello, I'm an environment variable")                                       Environment Variable
				env.WASM_MODULE_ONE (some_wasm.wasm)                                                         Wasm Module
				env.WASM_MODULE_TWO (more_wasm.wasm)                                                         Wasm Module

				The following unsafe metadata will be attached to your Worker:
				{
				  "extra_data": "interesting value",
				  "more_data": "dubious value"
				}
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - "unsafe" fields are experimental and may change or break at any time.

				"
			`);
		});

		it("should error when bindings of different types have the same name", async () => {
			writeWranglerConfig({
				durable_objects: {
					bindings: [
						{
							name: "CONFLICTING_NAME_ONE",
							class_name: "SomeDurableObject",
							script_name: "some-durable-object-worker",
						},
						{
							name: "CONFLICTING_NAME_TWO",
							class_name: "AnotherDurableObject",
							script_name: "another-durable-object-worker",
						},
					],
				},
				kv_namespaces: [
					{ binding: "CONFLICTING_NAME_ONE", id: "kv-ns-one-id" },
					{ binding: "CONFLICTING_NAME_TWO", id: "kv-ns-two-id" },
				],
				r2_buckets: [
					{
						binding: "CONFLICTING_NAME_ONE",
						bucket_name: "r2-bucket-one-name",
					},
					{
						binding: "CONFLICTING_NAME_THREE",
						bucket_name: "r2-bucket-two-name",
					},
				],
				analytics_engine_datasets: [
					{
						binding: "CONFLICTING_NAME_FOUR",
						dataset: "analytics-engine-dataset-name",
					},
				],
				text_blobs: {
					CONFLICTING_NAME_THREE: "./my-entire-app-depends-on-this.cfg",
					CONFLICTING_NAME_FOUR: "./the-entirety-of-human-knowledge.txt",
				},
				unsafe: {
					bindings: [
						{
							name: "CONFLICTING_NAME_THREE",
							type: "some unsafe thing",
							data: { some: { unsafe: "thing" } },
						},
						{
							name: "CONFLICTING_NAME_FOUR",
							type: "another unsafe thing",
							data: 1337,
						},
					],
					metadata: undefined,
				},
				vars: {
					ENV_VAR_ONE: 123,
					CONFLICTING_NAME_THREE: "Hello, I'm an environment variable",
				},
				wasm_modules: {
					WASM_MODULE_ONE: "./some_wasm.wasm",
					CONFLICTING_NAME_THREE: "./more_wasm.wasm",
				},
				data_blobs: {
					DATA_BLOB_ONE: "./some_data.bin",
					CONFLICTING_NAME_THREE: "./more_data.bin",
				},
			});

			writeWorkerSource({ type: "sw" });
			fs.writeFileSync("./my-entire-app-depends-on-this.cfg", "config = value");
			fs.writeFileSync(
				"./the-entirety-of-human-knowledge.txt",
				"Everything's bigger in Texas"
			);
			fs.writeFileSync("./some_wasm.wasm", "some wasm");
			fs.writeFileSync("./more_wasm.wasm", "more wasm");

			await expect(runWrangler("deploy index.js")).rejects
				.toMatchInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - CONFLICTING_NAME_THREE assigned to Data Blob, R2 Bucket, Text Blob, Unsafe Metadata, Environment Variable, and Wasm Module bindings.
				  - CONFLICTING_NAME_ONE assigned to Durable Object, KV Namespace, and R2 Bucket bindings.
				  - CONFLICTING_NAME_TWO assigned to Durable Object and KV Namespace bindings.
				  - CONFLICTING_NAME_FOUR assigned to Analytics Engine Dataset, Text Blob, and Unsafe Metadata bindings.
				  - Bindings must have unique names, so that they can all be referenced in the worker.
				    Please change your bindings to have unique names.]
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

				    - CONFLICTING_NAME_THREE assigned to Data Blob, R2 Bucket, Text Blob, Unsafe Metadata,
				  Environment Variable, and Wasm Module bindings.
				    - CONFLICTING_NAME_ONE assigned to Durable Object, KV Namespace, and R2 Bucket bindings.
				    - CONFLICTING_NAME_TWO assigned to Durable Object and KV Namespace bindings.
				    - CONFLICTING_NAME_FOUR assigned to Analytics Engine Dataset, Text Blob, and Unsafe Metadata
				  bindings.
				    - Bindings must have unique names, so that they can all be referenced in the worker.
				      Please change your bindings to have unique names.

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - "unsafe" fields are experimental and may change or break at any time.

				"
			`);
		});

		it("should error when bindings of the same type have the same name", async () => {
			writeWranglerConfig({
				durable_objects: {
					bindings: [
						{
							name: "CONFLICTING_DURABLE_OBJECT_NAME",
							class_name: "SomeDurableObject",
							script_name: "some-durable-object-worker",
						},
						{
							name: "CONFLICTING_DURABLE_OBJECT_NAME",
							class_name: "AnotherDurableObject",
							script_name: "another-durable-object-worker",
						},
					],
				},
				kv_namespaces: [
					{ binding: "CONFLICTING_KV_NAMESPACE_NAME", id: "kv-ns-one-id" },
					{ binding: "CONFLICTING_KV_NAMESPACE_NAME", id: "kv-ns-two-id" },
				],
				r2_buckets: [
					{
						binding: "CONFLICTING_R2_BUCKET_NAME",
						bucket_name: "r2-bucket-one-name",
					},
					{
						binding: "CONFLICTING_R2_BUCKET_NAME",
						bucket_name: "r2-bucket-two-name",
					},
				],
				analytics_engine_datasets: [
					{
						binding: "CONFLICTING_AE_DATASET_NAME",
						dataset: "ae-dataset-one-name",
					},
					{
						binding: "CONFLICTING_AE_DATASET_NAME",
						dataset: "ae-dataset-two-name",
					},
				],
				unsafe: {
					bindings: [
						{
							name: "CONFLICTING_UNSAFE_NAME",
							type: "some unsafe thing",
							data: { some: { unsafe: "thing" } },
						},
						{
							name: "CONFLICTING_UNSAFE_NAME",
							type: "another unsafe thing",
							data: 1337,
						},
					],
					metadata: undefined,
				},
				// text_blobs, vars, wasm_modules and data_blobs are fine because they're object literals,
				// and by definition cannot have two keys of the same name
				//
				// text_blobs: {
				//   CONFLICTING_TEXT_BLOB_NAME: "./my-entire-app-depends-on-this.cfg",
				//   CONFLICTING_TEXT_BLOB_NAME: "./the-entirety-of-human-knowledge.txt",
				// },
				// vars: {
				//   CONFLICTING_VARS_NAME: 123,
				//   CONFLICTING_VARS_NAME: "Hello, I'm an environment variable",
				// },
				// wasm_modules: {
				//   CONFLICTING_WASM_MODULE_NAME: "./some_wasm.wasm",
				//   CONFLICTING_WASM_MODULE_NAME: "./more_wasm.wasm",
				// },
			});

			writeWorkerSource({ type: "sw" });

			await expect(runWrangler("deploy index.js")).rejects
				.toMatchInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - CONFLICTING_DURABLE_OBJECT_NAME assigned to multiple Durable Object bindings.
				  - CONFLICTING_KV_NAMESPACE_NAME assigned to multiple KV Namespace bindings.
				  - CONFLICTING_R2_BUCKET_NAME assigned to multiple R2 Bucket bindings.
				  - CONFLICTING_AE_DATASET_NAME assigned to multiple Analytics Engine Dataset bindings.
				  - CONFLICTING_UNSAFE_NAME assigned to multiple Unsafe Metadata bindings.
				  - Bindings must have unique names, so that they can all be referenced in the worker.
				    Please change your bindings to have unique names.]
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

				    - CONFLICTING_DURABLE_OBJECT_NAME assigned to multiple Durable Object bindings.
				    - CONFLICTING_KV_NAMESPACE_NAME assigned to multiple KV Namespace bindings.
				    - CONFLICTING_R2_BUCKET_NAME assigned to multiple R2 Bucket bindings.
				    - CONFLICTING_AE_DATASET_NAME assigned to multiple Analytics Engine Dataset bindings.
				    - CONFLICTING_UNSAFE_NAME assigned to multiple Unsafe Metadata bindings.
				    - Bindings must have unique names, so that they can all be referenced in the worker.
				      Please change your bindings to have unique names.

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - "unsafe" fields are experimental and may change or break at any time.

				"
			`);
		});

		it("should error correctly when bindings of the same and different types use the same name", async () => {
			writeWranglerConfig({
				durable_objects: {
					bindings: [
						{
							name: "CONFLICTING_DURABLE_OBJECT_NAME",
							class_name: "SomeDurableObject",
							script_name: "some-durable-object-worker",
						},
						{
							name: "CONFLICTING_DURABLE_OBJECT_NAME",
							class_name: "AnotherDurableObject",
							script_name: "another-durable-object-worker",
						},
					],
				},
				kv_namespaces: [
					{
						binding: "CONFLICTING_KV_NAMESPACE_NAME",
						id: "kv-ns-one-id",
					},
					{
						binding: "CONFLICTING_KV_NAMESPACE_NAME",
						id: "kv-ns-two-id",
					},
					{ binding: "CONFLICTING_NAME_ONE", id: "kv-ns-three-id" },
					{ binding: "CONFLICTING_NAME_TWO", id: "kv-ns-four-id" },
				],
				r2_buckets: [
					{
						binding: "CONFLICTING_R2_BUCKET_NAME",
						bucket_name: "r2-bucket-one-name",
					},
					{
						binding: "CONFLICTING_R2_BUCKET_NAME",
						bucket_name: "r2-bucket-two-name",
					},
					{
						binding: "CONFLICTING_NAME_THREE",
						bucket_name: "r2-bucket-three-name",
					},
					{
						binding: "CONFLICTING_NAME_FOUR",
						bucket_name: "r2-bucket-four-name",
					},
				],
				analytics_engine_datasets: [
					{
						binding: "CONFLICTING_AE_DATASET_NAME",
						dataset: "ae-dataset-one-name",
					},
					{
						binding: "CONFLICTING_AE_DATASET_NAME",
						dataset: "ae-dataset-two-name",
					},
					{
						binding: "CONFLICTING_NAME_THREE",
						dataset: "ae-dataset-three-name",
					},
					{
						binding: "CONFLICTING_NAME_FOUR",
						dataset: "ae-dataset-four-name",
					},
				],
				text_blobs: {
					CONFLICTING_NAME_THREE: "./my-entire-app-depends-on-this.cfg",
					CONFLICTING_NAME_FOUR: "./the-entirety-of-human-knowledge.txt",
				},
				unsafe: {
					bindings: [
						{
							name: "CONFLICTING_UNSAFE_NAME",
							type: "some unsafe thing",
							data: { some: { unsafe: "thing" } },
						},
						{
							name: "CONFLICTING_UNSAFE_NAME",
							type: "another unsafe thing",
							data: 1337,
						},
						{
							name: "CONFLICTING_NAME_THREE",
							type: "yet another unsafe thing",
							data: "how is a string unsafe?",
						},
						{
							name: "CONFLICTING_NAME_FOUR",
							type: "a fourth unsafe thing",
							data: null,
						},
					],
					metadata: undefined,
				},
				vars: {
					ENV_VAR_ONE: 123,
					CONFLICTING_NAME_THREE: "Hello, I'm an environment variable",
				},
				wasm_modules: {
					WASM_MODULE_ONE: "./some_wasm.wasm",
					CONFLICTING_NAME_THREE: "./more_wasm.wasm",
				},
				data_blobs: {
					DATA_BLOB_ONE: "./some_data.bin",
					CONFLICTING_NAME_THREE: "./more_data.bin",
				},
			});

			writeWorkerSource({ type: "sw" });
			fs.writeFileSync("./my-entire-app-depends-on-this.cfg", "config = value");
			fs.writeFileSync(
				"./the-entirety-of-human-knowledge.txt",
				"Everything's bigger in Texas"
			);
			fs.writeFileSync("./some_wasm.wasm", "some wasm");
			fs.writeFileSync("./more_wasm.wasm", "more wasm");

			await expect(runWrangler("deploy index.js")).rejects
				.toMatchInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - CONFLICTING_NAME_THREE assigned to Data Blob, R2 Bucket, Analytics Engine Dataset, Text Blob, Unsafe Metadata, Environment Variable, and Wasm Module bindings.
				  - CONFLICTING_DURABLE_OBJECT_NAME assigned to multiple Durable Object bindings.
				  - CONFLICTING_KV_NAMESPACE_NAME assigned to multiple KV Namespace bindings.
				  - CONFLICTING_R2_BUCKET_NAME assigned to multiple R2 Bucket bindings.
				  - CONFLICTING_NAME_FOUR assigned to R2 Bucket, Analytics Engine Dataset, Text Blob, and Unsafe Metadata bindings.
				  - CONFLICTING_AE_DATASET_NAME assigned to multiple Analytics Engine Dataset bindings.
				  - CONFLICTING_UNSAFE_NAME assigned to multiple Unsafe Metadata bindings.
				  - Bindings must have unique names, so that they can all be referenced in the worker.
				    Please change your bindings to have unique names.]
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

				    - CONFLICTING_NAME_THREE assigned to Data Blob, R2 Bucket, Analytics Engine Dataset, Text Blob,
				  Unsafe Metadata, Environment Variable, and Wasm Module bindings.
				    - CONFLICTING_DURABLE_OBJECT_NAME assigned to multiple Durable Object bindings.
				    - CONFLICTING_KV_NAMESPACE_NAME assigned to multiple KV Namespace bindings.
				    - CONFLICTING_R2_BUCKET_NAME assigned to multiple R2 Bucket bindings.
				    - CONFLICTING_NAME_FOUR assigned to R2 Bucket, Analytics Engine Dataset, Text Blob, and Unsafe
				  Metadata bindings.
				    - CONFLICTING_AE_DATASET_NAME assigned to multiple Analytics Engine Dataset bindings.
				    - CONFLICTING_UNSAFE_NAME assigned to multiple Unsafe Metadata bindings.
				    - Bindings must have unique names, so that they can all be referenced in the worker.
				      Please change your bindings to have unique names.

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - "unsafe" fields are experimental and may change or break at any time.

				"
			`);
		});

		describe("[wasm_modules]", () => {
			it("should be able to define wasm modules for service-worker format workers", async () => {
				writeWranglerConfig({
					wasm_modules: {
						TESTWASMNAME: "./path/to/test.wasm",
					},
				});
				writeWorkerSource({ type: "sw" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/test.wasm", "SOME WASM CONTENT");
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTWASMNAME: "SOME WASM CONTENT" },
					expectedBindings: [
						{ name: "TESTWASMNAME", part: "TESTWASMNAME", type: "wasm_module" },
					],
					useOldUploadApi: true,
				});
				mockSubDomainRequest();

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                   Resource
					env.TESTWASMNAME (path/to/test.wasm)      Wasm Module

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should error when defining wasm modules for modules format workers", async () => {
				writeWranglerConfig({
					wasm_modules: {
						TESTWASMNAME: "./path/to/test.wasm",
					},
				});
				writeWorkerSource({ type: "esm" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/test.wasm", "SOME WASM CONTENT");

				await expect(
					runWrangler("deploy index.js")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					"
				`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code[0m

			          "
		        `);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should resolve wasm modules relative to the wrangler.toml file", async () => {
				fs.mkdirSync("./path/to/and/the/path/to/", { recursive: true });
				fs.writeFileSync(
					"./path/to/wrangler.toml",
					TOML.stringify({
						compatibility_date: "2022-01-12",
						name: "test-name",
						wasm_modules: {
							TESTWASMNAME: "./and/the/path/to/test.wasm",
						},
					}),

					"utf-8"
				);

				writeWorkerSource({ type: "sw" });
				fs.writeFileSync(
					"./path/to/and/the/path/to/test.wasm",
					"SOME WASM CONTENT"
				);
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTWASMNAME: "SOME WASM CONTENT" },
					expectedBindings: [
						{ name: "TESTWASMNAME", part: "TESTWASMNAME", type: "wasm_module" },
					],
					expectedCompatibilityDate: "2022-01-12",
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js --config ./path/to/wrangler.toml");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                                   Resource
					env.TESTWASMNAME (path/to/and/the/path/to/test.wasm)      Wasm Module

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should be able to import .wasm modules from service-worker format workers", async () => {
				writeWranglerConfig();
				fs.writeFileSync(
					"./index.js",
					"import TESTWASMNAME from './test.wasm';"
				);
				fs.writeFileSync("./test.wasm", "SOME WASM CONTENT");
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: {
						__94b240d0d692281e6467aa42043986e5c7eea034_test_wasm:
							"SOME WASM CONTENT",
					},
					expectedBindings: [
						{
							name: "__94b240d0d692281e6467aa42043986e5c7eea034_test_wasm",
							part: "__94b240d0d692281e6467aa42043986e5c7eea034_test_wasm",
							type: "wasm_module",
						},
					],
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[text_blobs]", () => {
			it("should be able to define text blobs for service-worker format workers", async () => {
				writeWranglerConfig({
					text_blobs: {
						TESTTEXTBLOBNAME: "./path/to/text.file",
					},
				});
				writeWorkerSource({ type: "sw" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/text.file", "SOME TEXT CONTENT");
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTTEXTBLOBNAME: "SOME TEXT CONTENT" },
					expectedBindings: [
						{
							name: "TESTTEXTBLOBNAME",
							part: "TESTTEXTBLOBNAME",
							type: "text_blob",
						},
					],
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                       Resource
					env.TESTTEXTBLOBNAME (path/to/text.file)      Text Blob

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should error when defining text blobs for modules format workers", async () => {
				writeWranglerConfig({
					text_blobs: {
						TESTTEXTBLOBNAME: "./path/to/text.file",
					},
				});
				writeWorkerSource({ type: "esm" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/text.file", "SOME TEXT CONTENT");

				await expect(
					runWrangler("deploy index.js")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your wrangler.toml file]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					"
				`);
				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your wrangler.toml file[0m

					"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should resolve text blobs relative to the wrangler.toml file", async () => {
				fs.mkdirSync("./path/to/and/the/path/to/", { recursive: true });
				fs.writeFileSync(
					"./path/to/wrangler.toml",
					TOML.stringify({
						compatibility_date: "2022-01-12",
						name: "test-name",
						text_blobs: {
							TESTTEXTBLOBNAME: "./and/the/path/to/text.file",
						},
					}),

					"utf-8"
				);

				writeWorkerSource({ type: "sw" });
				fs.writeFileSync(
					"./path/to/and/the/path/to/text.file",
					"SOME TEXT CONTENT"
				);
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTTEXTBLOBNAME: "SOME TEXT CONTENT" },
					expectedBindings: [
						{
							name: "TESTTEXTBLOBNAME",
							part: "TESTTEXTBLOBNAME",
							type: "text_blob",
						},
					],
					expectedCompatibilityDate: "2022-01-12",
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js --config ./path/to/wrangler.toml");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                                       Resource
					env.TESTTEXTBLOBNAME (path/to/and/the/path/to/text.file)      Text Blob

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[data_blobs]", () => {
			it("should be able to define data blobs for service-worker format workers", async () => {
				writeWranglerConfig({
					data_blobs: {
						TESTDATABLOBNAME: "./path/to/data.bin",
					},
				});
				writeWorkerSource({ type: "sw" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/data.bin", "SOME DATA CONTENT");
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTDATABLOBNAME: "SOME DATA CONTENT" },
					expectedBindings: [
						{
							name: "TESTDATABLOBNAME",
							part: "TESTDATABLOBNAME",
							type: "data_blob",
						},
					],
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                      Resource
					env.TESTDATABLOBNAME (path/to/data.bin)      Data Blob

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should error when defining data blobs for modules format workers", async () => {
				writeWranglerConfig({
					data_blobs: {
						TESTDATABLOBNAME: "./path/to/data.bin",
					},
				});
				writeWorkerSource({ type: "esm" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/data.bin", "SOME DATA CONTENT");

				await expect(
					runWrangler("deploy index.js")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your wrangler.toml file]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					"
				`);
				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your wrangler.toml file[0m

					"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should resolve data blobs relative to the wrangler.toml file", async () => {
				fs.mkdirSync("./path/to/and/the/path/to/", { recursive: true });
				fs.writeFileSync(
					"./path/to/wrangler.toml",
					TOML.stringify({
						compatibility_date: "2022-01-12",
						name: "test-name",
						data_blobs: {
							TESTDATABLOBNAME: "./and/the/path/to/data.bin",
						},
					}),

					"utf-8"
				);

				writeWorkerSource({ type: "sw" });
				fs.writeFileSync(
					"./path/to/and/the/path/to/data.bin",
					"SOME DATA CONTENT"
				);
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTDATABLOBNAME: "SOME DATA CONTENT" },
					expectedBindings: [
						{
							name: "TESTDATABLOBNAME",
							part: "TESTDATABLOBNAME",
							type: "data_blob",
						},
					],
					expectedCompatibilityDate: "2022-01-12",
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js --config ./path/to/wrangler.toml");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                                      Resource
					env.TESTDATABLOBNAME (path/to/and/the/path/to/data.bin)      Data Blob

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[vars]", () => {
			it("should support json bindings", async () => {
				writeWranglerConfig({
					vars: {
						text: "plain ol' string",
						count: 1,
						complex: { enabled: true, id: 123 },
					},
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{ name: "text", type: "plain_text", text: "plain ol' string" },
						{ name: "count", type: "json", json: 1 },
						{
							name: "complex",
							type: "json",
							json: { enabled: true, id: 123 },
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                      Resource
					env.text ("plain ol' string")                Environment Variable
					env.count (1)                                Environment Variable
					env.complex ({"enabled":true,"id":123})      Environment Variable

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should render config vars literally and --var as hidden", async () => {
				writeWranglerConfig({
					vars: {
						CONFIG_VAR: "visible value",
					},
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				await runWrangler("deploy index.js --var CLI_VAR:from_cli");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                               Resource
					env.CONFIG_VAR ("visible value")      Environment Variable
					env.CLI_VAR ("(hidden)")              Environment Variable

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
			});

			it("should read vars passed as cli arguments", async () => {
				writeWranglerConfig();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				await runWrangler("deploy index.js --var TEXT:sometext --var COUNT:1");
				expect(std).toMatchInlineSnapshot(`
					{
					  "debug": "",
					  "err": "",
					  "info": "",
					  "out": "
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                     Resource
					env.TEXT ("(hidden)")       Environment Variable
					env.COUNT ("(hidden)")      Environment Variable

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class",
					  "warn": "",
					}
				`);
			});
		});

		describe("[r2_buckets]", () => {
			it("should support r2 bucket bindings", async () => {
				writeWranglerConfig({
					r2_buckets: [{ binding: "FOO", bucket_name: "foo-bucket" }],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{ bucket_name: "foo-bucket", name: "FOO", type: "r2_bucket" },
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                   Resource
					env.FOO (foo-bucket)      R2 Bucket

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[logfwdr]", () => {
			it("should support logfwdr bindings", async () => {
				writeWranglerConfig({
					logfwdr: {
						bindings: [
							{
								name: "httplogs",
								destination: "httplogs",
							},
							{
								name: "trace",
								destination: "trace",
							},
						],
					},
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							name: "httplogs",
							type: "logfwdr",
							destination: "httplogs",
						},
						{
							name: "trace",
							type: "logfwdr",
							destination: "trace",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                      Resource
					env.httplogs (httplogs)      logfwdr
					env.trace (trace)            logfwdr

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should error when logfwdr schemas are specified", async () => {
				writeWranglerConfig({
					logfwdr: {
						// @ts-expect-error this property been replaced with the unsafe.capnp section
						schema: "./message.capnp.compiled",
						bindings: [
							{
								name: "httplogs",
								destination: "httplogs",
							},
							{
								name: "trace",
								destination: "trace",
							},
						],
					},
				});

				await expect(() => runWrangler("deploy index.js")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
					[Error: Processing wrangler.toml configuration:
					  - "logfwdr" binding "schema" property has been replaced with the "unsafe.capnp" object, which expects a "base_path" and an array of "source_schemas" to compile, or a "compiled_schema" property.]
				`);
			});
		});

		describe("[durable_objects]", () => {
			it("should support durable object bindings", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
					migrations: [{ tag: "v1", new_classes: ["ExampleDurableObject"] }],
				});
				fs.writeFileSync(
					"index.js",
					`export class ExampleDurableObject {}; export default{};`
				);
				mockSubDomainRequest();
				mockLegacyScriptData({
					scripts: [{ id: "test-name", migration_tag: "v1" }],
				});
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							class_name: "ExampleDurableObject",
							name: "EXAMPLE_DO_BINDING",
							type: "durable_object_namespace",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                            Resource
					env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support durable object bindings to SQLite classes", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
					migrations: [
						{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class ExampleDurableObject {}; export default{};`
				);
				mockSubDomainRequest();
				mockLegacyScriptData({
					scripts: [{ id: "test-name", migration_tag: "v1" }],
				});
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							class_name: "ExampleDurableObject",
							name: "EXAMPLE_DO_BINDING",
							type: "durable_object_namespace",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                            Resource
					env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support service-workers binding to external durable objects", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
								script_name: "example-do-binding-worker",
							},
						],
					},
				});
				writeWorkerSource({ type: "sw" });
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedBindings: [
						{
							name: "EXAMPLE_DO_BINDING",
							class_name: "ExampleDurableObject",
							script_name: "example-do-binding-worker",
							type: "durable_object_namespace",
						},
					],
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                                                                  Resource
					env.EXAMPLE_DO_BINDING (ExampleDurableObject, defined in example-do-binding-worker)      Durable Object

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support module workers implementing durable objects", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
					migrations: [{ tag: "v1", new_classes: ["ExampleDurableObject"] }],
				});
				fs.writeFileSync(
					"index.js",
					`export class ExampleDurableObject {}; export default{};`
				);
				mockSubDomainRequest();
				mockLegacyScriptData({
					scripts: [{ id: "test-name", migration_tag: "v1" }],
				});
				mockUploadWorkerRequest({
					expectedType: "esm",
					expectedBindings: [
						{
							name: "EXAMPLE_DO_BINDING",
							class_name: "ExampleDurableObject",
							type: "durable_object_namespace",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                            Resource
					env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support durable objects and D1", async () => {
				writeWranglerConfig({
					main: "index.js",
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
					migrations: [{ tag: "v1", new_classes: ["ExampleDurableObject"] }],
					d1_databases: [
						{
							binding: "DB",
							database_name: "test-d1-db",
							database_id: "UUID-1-2-3-4",
							preview_database_id: "UUID-1-2-3-4",
						},
					],
				});
				const scriptContent = `export class ExampleDurableObject {}; export default{};`;
				fs.writeFileSync("index.js", scriptContent);
				mockSubDomainRequest();
				mockLegacyScriptData({
					scripts: [{ id: "test-name", migration_tag: "v1" }],
				});
				mockUploadWorkerRequest({
					expectedType: "esm",
					expectedBindings: [
						{
							name: "EXAMPLE_DO_BINDING",
							class_name: "ExampleDurableObject",
							type: "durable_object_namespace",
						},
						{ name: "DB", type: "d1_database" },
					],
				});

				await runWrangler("deploy index.js --outdir tmp --dry-run");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Your Worker has access to the following bindings:
					Binding                                            Resource
					env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object
					env.DB (UUID-1-2-3-4)                              D1 Database

					--dry-run: exiting now."
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				const output = fs.readFileSync("tmp/index.js", "utf-8");
				// D1 no longer injects middleware, so we can pass through the user's code unchanged
				expect(output).not.toContain(`ExampleDurableObject2`);
				// ExampleDurableObject is exported directly
				expect(output).toContain("export {\n  ExampleDurableObject,");
			});

			it("should support durable objects and D1", async () => {
				writeWranglerConfig({
					main: "index.js",
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
					migrations: [{ tag: "v1", new_classes: ["ExampleDurableObject"] }],
					d1_databases: [
						{
							binding: "DB",
							database_name: "test-d1-db",
							database_id: "UUID-1-2-3-4",
							preview_database_id: "UUID-1-2-3-4",
						},
					],
				});
				const scriptContent = `export class ExampleDurableObject {}; export default{};`;
				fs.writeFileSync("index.js", scriptContent);
				mockSubDomainRequest();
				mockLegacyScriptData({
					scripts: [{ id: "test-name", migration_tag: "v1" }],
				});
				mockUploadWorkerRequest({
					expectedType: "esm",
					expectedBindings: [
						{
							name: "EXAMPLE_DO_BINDING",
							class_name: "ExampleDurableObject",
							type: "durable_object_namespace",
						},
						{ name: "DB", type: "d1_database" },
					],
				});

				await runWrangler("deploy index.js --outdir tmp --dry-run");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Your Worker has access to the following bindings:
					Binding                                            Resource
					env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object
					env.DB (UUID-1-2-3-4)                              D1 Database

					--dry-run: exiting now."
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				const output = fs.readFileSync("tmp/index.js", "utf-8");
				// D1 no longer injects middleware, so we can pass through the user's code unchanged
				expect(output).not.toContain(`ExampleDurableObject2`);
				// ExampleDurableObject is exported directly
				expect(output).toContain("export {\n  ExampleDurableObject,");
			});

			it("should error when detecting a service-worker worker implementing durable objects", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
				});
				writeWorkerSource({ type: "sw" });
				mockSubDomainRequest();

				await expect(runWrangler("deploy index.js")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
					[Error: You seem to be trying to use Durable Objects in a Worker written as a service-worker.
					You can use Durable Objects defined in other Workers by specifying a \`script_name\` in your wrangler.toml file, where \`script_name\` is the name of the Worker that implements that Durable Object. For example:
					{ name = EXAMPLE_DO_BINDING, class_name = ExampleDurableObject } ==> { name = EXAMPLE_DO_BINDING, class_name = ExampleDurableObject, script_name = example-do-binding-worker }
					Alternatively, migrate your worker to ES Module syntax to implement a Durable Object in this Worker:
					https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/]
				`);
			});
		});

		describe("[services]", () => {
			it("should support service bindings", async () => {
				writeWranglerConfig({
					services: [
						{
							binding: "FOO",
							service: "foo-service",
							environment: "production",
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "service",
							name: "FOO",
							service: "foo-service",
							environment: "production",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                    Resource
					env.FOO (foo-service)      Worker

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support service bindings with entrypoints", async () => {
				writeWranglerConfig({
					services: [
						{
							binding: "FOO",
							service: "foo-service",
							environment: "production",
							entrypoint: "MyHandler",
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "service",
							name: "FOO",
							service: "foo-service",
							environment: "production",
							entrypoint: "MyHandler",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                              Resource
					env.FOO (foo-service#MyHandler)      Worker

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support service bindings with props", async () => {
				writeWranglerConfig({
					services: [
						{
							binding: "FOO",
							service: "foo-service",
							props: { foo: 123, bar: { baz: "hello from props" } },
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "service",
							name: "FOO",
							service: "foo-service",
							props: { foo: 123, bar: { baz: "hello from props" } },
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                    Resource
					env.FOO (foo-service)      Worker

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support the internal and non-public facing cross_account_grant service binding field", async () => {
				writeWranglerConfig({
					services: [
						{
							binding: "FOO",
							service: "foo-service",
							// @ts-expect-error - cross_account_gran is purposely not included in the config types (since it is an internal-only feature)
							cross_account_grant: "grant-service",
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							cross_account_grant: "grant-service",
							name: "FOO",
							service: "foo-service",
							type: "service",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                    Resource
					env.FOO (foo-service)      Worker

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[analytics_engine_datasets]", () => {
			it("should support analytics engine bindings", async () => {
				writeWranglerConfig({
					analytics_engine_datasets: [
						{ binding: "FOO", dataset: "foo-dataset" },
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{ dataset: "foo-dataset", name: "FOO", type: "analytics_engine" },
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                    Resource
					env.FOO (foo-dataset)      Analytics Engine Dataset

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[dispatch_namespaces]", () => {
			it("should support bindings to a dispatch namespace", async () => {
				writeWranglerConfig({
					dispatch_namespaces: [
						{
							binding: "foo",
							namespace: "Foo",
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "dispatch_namespace",
							name: "foo",
							namespace: "Foo",
						},
					],
				});
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding            Resource
					env.foo (Foo)      Dispatch Namespace

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support dispatch namespace bindings with an outbound worker", async () => {
				writeWranglerConfig({
					dispatch_namespaces: [
						{
							binding: "foo",
							namespace: "Foo",
							outbound: { service: "foo_outbound" },
						},
						{
							binding: "bar",
							namespace: "Bar",
							outbound: { service: "bar_outbound", environment: "production" },
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "dispatch_namespace",
							name: "foo",
							namespace: "Foo",
							outbound: {
								worker: {
									service: "foo_outbound",
								},
							},
						},
						{
							type: "dispatch_namespace",
							name: "bar",
							namespace: "Bar",
							outbound: {
								worker: {
									service: "bar_outbound",
									environment: "production",
								},
							},
						},
					],
				});
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                       Resource
					env.foo (Foo (outbound -> foo_outbound))      Dispatch Namespace
					env.bar (Bar (outbound -> bar_outbound))      Dispatch Namespace

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support dispatch namespace bindings with parameterized outbounds", async () => {
				writeWranglerConfig({
					dispatch_namespaces: [
						{
							binding: "foo",
							namespace: "Foo",
							outbound: {
								service: "foo_outbound",
								parameters: ["some", "outbound", "params"],
							},
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "dispatch_namespace",
							name: "foo",
							namespace: "Foo",
							outbound: {
								worker: {
									service: "foo_outbound",
								},
								params: [
									{ name: "some" },
									{ name: "outbound" },
									{ name: "params" },
								],
							},
						},
					],
				});
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                       Resource
					env.foo (Foo (outbound -> foo_outbound))      Dispatch Namespace

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[unsafe]", () => {
			describe("[unsafe.bindings]", () => {
				it("should stringify object in unsafe metadata", async () => {
					writeWranglerConfig({
						unsafe: {
							metadata: {
								stringify: true,
								something: "else",
								undefined: undefined,
								null: null,
								nested: {
									stuff: "here",
								},
							},
						},
					});
					writeWorkerSource();
					mockSubDomainRequest();
					mockUploadWorkerRequest({
						expectedUnsafeMetaData: {
							stringify: true,
							something: "else",
							nested: {
								stuff: "here",
							},
						},
					});
					await runWrangler("deploy index.js");
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Total Upload: xx KiB / gzip: xx KiB
						Worker Startup Time: 100 ms
						The following unsafe metadata will be attached to your Worker:
						{
						  "stringify": true,
						  "something": "else",
						  "nested": {
						    "stuff": "here"
						  }
						}
						Uploaded test-name (TIMINGS)
						Deployed test-name triggers (TIMINGS)
						  https://test-name.test-sub-domain.workers.dev
						Current Version ID: Galaxy-Class"
					`);
				});

				it("should warn if using unsafe bindings", async () => {
					writeWranglerConfig({
						unsafe: {
							bindings: [
								{
									name: "my-binding",
									type: "binding-type",
									param: "binding-param",
								},
							],
							metadata: undefined,
						},
					});
					writeWorkerSource();
					mockSubDomainRequest();
					mockUploadWorkerRequest({
						expectedBindings: [
							{
								name: "my-binding",
								type: "binding-type",
								param: "binding-param",
							},
						],
					});

					await runWrangler("deploy index.js");
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Total Upload: xx KiB / gzip: xx KiB
						Worker Startup Time: 100 ms
						Your Worker has access to the following bindings:
						Binding                            Resource
						env.my-binding (binding-type)      Unsafe Metadata

						Uploaded test-name (TIMINGS)
						Deployed test-name triggers (TIMINGS)
						  https://test-name.test-sub-domain.workers.dev
						Current Version ID: Galaxy-Class"
					`);
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.warn).toMatchInlineSnapshot(`
						"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

						    - "unsafe" fields are experimental and may change or break at any time.

						"
					`);
				});

				it("should warn if using unsafe bindings already handled by wrangler", async () => {
					writeWranglerConfig({
						unsafe: {
							bindings: [
								{
									name: "my-binding",
									type: "plain_text",
									text: "text",
								},
							],
							metadata: undefined,
						},
					});
					writeWorkerSource();
					mockSubDomainRequest();
					mockUploadWorkerRequest({
						expectedBindings: [
							{
								name: "my-binding",
								type: "plain_text",
								text: "text",
							},
						],
					});

					await runWrangler("deploy index.js");
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Total Upload: xx KiB / gzip: xx KiB
						Worker Startup Time: 100 ms
						Your Worker has access to the following bindings:
						Binding                          Resource
						env.my-binding (plain_text)      Unsafe Metadata

						Uploaded test-name (TIMINGS)
						Deployed test-name triggers (TIMINGS)
						  https://test-name.test-sub-domain.workers.dev
						Current Version ID: Galaxy-Class"
					`);
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.warn).toMatchInlineSnapshot(`
						"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

						    - "unsafe" fields are experimental and may change or break at any time.
						    - "unsafe.bindings[0]": {"name":"my-binding","type":"plain_text","text":"text"}
						      - The binding type "plain_text" is directly supported by wrangler.
						        Consider migrating this unsafe binding to a format for 'plain_text' bindings that is
						  supported by wrangler for optimal support.
						        For more details, see [4mhttps://developers.cloudflare.com/workers/cli-wrangler/configuration[0m

						"
					`);
				});
			});
			describe("[unsafe.capnp]", () => {
				it("should accept a pre-compiled capnp schema", async () => {
					writeWranglerConfig({
						unsafe: {
							capnp: {
								compiled_schema: "./my-compiled-schema",
							},
						},
					});
					writeWorkerSource();
					mockSubDomainRequest();
					mockUploadWorkerRequest({
						expectedCapnpSchema: "my compiled capnp data",
					});
					fs.writeFileSync("./my-compiled-schema", "my compiled capnp data");

					await runWrangler("deploy index.js");
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Total Upload: xx KiB / gzip: xx KiB
						Worker Startup Time: 100 ms
						Uploaded test-name (TIMINGS)
						Deployed test-name triggers (TIMINGS)
						  https://test-name.test-sub-domain.workers.dev
						Current Version ID: Galaxy-Class"
					`);
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.warn).toMatchInlineSnapshot(`
						"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

						    - "unsafe" fields are experimental and may change or break at any time.

						"
					`);
				});
				it("should error when both pre-compiled and uncompiled-capnp schemas are used", async () => {
					writeWranglerConfig({
						unsafe: {
							capnp: {
								compiled_schema: "./my-compiled-schema",
								// @ts-expect-error This should error as the types don't accept having both
								source_schemas: ["./my-src-schema"],
							},
						},
					});
					writeWorkerSource();

					await expect(() => runWrangler("deploy index.js")).rejects
						.toThrowErrorMatchingInlineSnapshot(`
						[Error: Processing wrangler.toml configuration:
						  - The field "unsafe.capnp" cannot contain both "compiled_schema" and one of "base_path" or "source_schemas".]
					`);
				});
				it("should error when no schemas are specified", async () => {
					writeWranglerConfig({
						unsafe: {
							// @ts-expect-error This should error as the types expect something to be present
							capnp: {},
						},
					});
					writeWorkerSource();

					await expect(() => runWrangler("deploy index.js")).rejects
						.toThrowErrorMatchingInlineSnapshot(`
						[Error: Processing wrangler.toml configuration:
						  - The field "unsafe.capnp.base_path", when present, should be a string but got undefined
						  - Expected "unsafe.capnp.source_schemas" to be an array of strings but got undefined]
					`);
				});
				it("should error when the capnp compiler is not present, but is required", async () => {
					(sync as Mock).mockReturnValue(false);
					writeWranglerConfig({
						unsafe: {
							capnp: {
								base_path: "./",
								source_schemas: ["./my-src-schema"],
							},
						},
					});
					writeWorkerSource();

					await expect(() =>
						runWrangler("deploy index.js")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: The capnp compiler is required to upload capnp schemas, but is not present.]`
					);
				});
				it("should accept an uncompiled capnp schema", async () => {
					(sync as Mock).mockReturnValue(true);
					(spawnSync as Mock).mockImplementationOnce((cmd, args) => {
						expect(cmd).toBe("capnp");
						expect(args?.[0]).toBe("compile");
						expect(args?.[1]).toBe("-o-");
						expect(args?.[2]).toContain("--src-prefix=");
						expect(args?.[3]).toContain("my-compiled-schema");
						return {
							pid: -1,
							error: undefined,
							stderr: Buffer.from([]),
							stdout: Buffer.from("my compiled capnp data"),
							status: 0,
							signal: null,
							output: [null],
						};
					});

					writeWranglerConfig({
						unsafe: {
							capnp: {
								base_path: "./",
								source_schemas: ["./my-compiled-schema"],
							},
						},
					});
					writeWorkerSource();
					mockSubDomainRequest();
					mockUploadWorkerRequest({
						expectedCapnpSchema: "my compiled capnp data",
					});
					fs.writeFileSync("./my-compiled-schema", "my compiled capnp data");

					await runWrangler("deploy index.js");
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Total Upload: xx KiB / gzip: xx KiB
						Worker Startup Time: 100 ms
						Uploaded test-name (TIMINGS)
						Deployed test-name triggers (TIMINGS)
						  https://test-name.test-sub-domain.workers.dev
						Current Version ID: Galaxy-Class"
					`);
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.warn).toMatchInlineSnapshot(`
						"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

						    - "unsafe" fields are experimental and may change or break at any time.

						"
					`);
				});
			});
		});
	});
});
