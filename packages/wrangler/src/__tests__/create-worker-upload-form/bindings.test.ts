import { INHERIT_SYMBOL } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { createWorkerUploadForm } from "../../deployment-bundle/create-worker-upload-form";
import { createEsmWorker, getBindings } from "./helpers";
import type { StartDevWorkerInput } from "./helpers";

describe("createWorkerUploadForm — bindings", () => {
	describe("plain_text / json / secret_text bindings", () => {
		it.for([
			{
				label: "plain_text",
				input: { type: "plain_text" as const, value: "hello" },
				expected: { type: "plain_text", text: "hello" },
			},
			{
				label: "json",
				input: { type: "json" as const, value: { foo: "bar" } },
				expected: { type: "json", json: { foo: "bar" } },
			},
			{
				label: "secret_text",
				input: { type: "secret_text" as const, value: "s3cret" },
				expected: { type: "secret_text", text: "s3cret" },
			},
		])(
			"should include $label binding in metadata",
			({ input, expected }, { expect }) => {
				const bindings: StartDevWorkerInput["bindings"] = {
					MY_BINDING: input,
				};
				const form = createWorkerUploadForm(createEsmWorker(), bindings);
				const metadataBindings = getBindings(form);
				expect(metadataBindings).toContainEqual({
					name: "MY_BINDING",
					...expected,
				});
			}
		);
	});

	describe("kv_namespace bindings", () => {
		it("should include KV bindings with an ID", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_KV: { type: "kv_namespace", id: "abc123" },
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_KV",
				type: "kv_namespace",
				namespace_id: "abc123",
			});
		});

		it("should throw when KV namespace has no ID and not in dry run", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_KV: { type: "kv_namespace" } as never,
			};
			expect(() =>
				createWorkerUploadForm(createEsmWorker(), bindings)
			).toThrowError('MY_KV bindings must have an "id" field');
		});

		it("should convert KV namespace to inherit binding during dry run when ID is missing", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_KV: { type: "kv_namespace" } as never,
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings, {
				dryRun: true,
			});
			expect(getBindings(form)).toContainEqual({
				name: "MY_KV",
				type: "inherit",
			});
		});

		it("should convert KV namespace with INHERIT_SYMBOL to inherit binding", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_KV: { type: "kv_namespace", id: INHERIT_SYMBOL },
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_KV",
				type: "inherit",
			});
		});
	});

	describe("r2_bucket bindings", () => {
		it("should include R2 bindings with a bucket_name", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_BUCKET: {
					type: "r2_bucket",
					bucket_name: "my-bucket",
					jurisdiction: "eu",
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_BUCKET",
				type: "r2_bucket",
				bucket_name: "my-bucket",
				jurisdiction: "eu",
			});
		});

		it("should throw when R2 bucket has no bucket_name and not in dry run", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_BUCKET: { type: "r2_bucket" } as never,
			};
			expect(() =>
				createWorkerUploadForm(createEsmWorker(), bindings)
			).toThrowError('MY_BUCKET bindings must have a "bucket_name" field');
		});

		it("should convert R2 bucket to inherit binding during dry run when bucket_name is missing", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_BUCKET: { type: "r2_bucket" } as never,
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings, {
				dryRun: true,
			});
			expect(getBindings(form)).toContainEqual({
				name: "MY_BUCKET",
				type: "inherit",
			});
		});
	});

	describe("d1 bindings", () => {
		it("should include D1 bindings with a database_id", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_DB: { type: "d1", database_id: "db-123" },
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_DB",
				type: "d1",
				id: "db-123",
			});
		});

		it("should throw when D1 has no database_id and not in dry run", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_DB: { type: "d1" } as never,
			};
			expect(() =>
				createWorkerUploadForm(createEsmWorker(), bindings)
			).toThrowError('MY_DB bindings must have a "database_id" field');
		});

		it("should convert D1 to inherit binding during dry run when database_id is missing", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_DB: { type: "d1" } as never,
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings, {
				dryRun: true,
			});
			expect(getBindings(form)).toContainEqual({
				name: "MY_DB",
				type: "inherit",
			});
		});
	});

	describe("durable_object_namespace bindings", () => {
		it("should include durable object bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_DO: {
					type: "durable_object_namespace",
					class_name: "MyDO",
					script_name: "other-worker",
					environment: "production",
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_DO",
				type: "durable_object_namespace",
				class_name: "MyDO",
				script_name: "other-worker",
				environment: "production",
			});
		});

		it("should omit optional script_name and environment when not provided", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_DO: {
					type: "durable_object_namespace",
					class_name: "MyDO",
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			const doBinding = getBindings(form).find((b) => b.name === "MY_DO");
			expect(doBinding).toBeDefined();
			expect(doBinding?.script_name).toBeUndefined();
			expect(doBinding?.environment).toBeUndefined();
		});
	});

	describe("service bindings", () => {
		it("should include service bindings with optional environment and entrypoint", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				AUTH: {
					type: "service",
					service: "auth-worker",
					environment: "production",
					entrypoint: "AuthHandler",
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "AUTH",
				type: "service",
				service: "auth-worker",
				environment: "production",
				entrypoint: "AuthHandler",
			});
		});
	});

	describe("queue bindings", () => {
		it("should include queue bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_QUEUE: {
					type: "queue",
					queue_name: "my-queue",
					delivery_delay: 60,
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_QUEUE",
				type: "queue",
				queue_name: "my-queue",
				delivery_delay: 60,
			});
		});
	});

	describe("workflow bindings", () => {
		it("should include workflow bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_WORKFLOW: {
					type: "workflow",
					name: "my-workflow",
					class_name: "MyWorkflow",
					script_name: "workflow-worker",
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_WORKFLOW",
				type: "workflow",
				workflow_name: "my-workflow",
				class_name: "MyWorkflow",
				script_name: "workflow-worker",
			});
		});
	});

	describe("pass-through binding types", () => {
		it.for([
			{ type: "vectorize" as const, index_name: "my-index" },
			{ type: "hyperdrive" as const, id: "hd-123" },
			{ type: "analytics_engine" as const, dataset: "my-dataset" },
			{ type: "mtls_certificate" as const, certificate_id: "cert-123" },
			{
				type: "secrets_store_secret" as const,
				store_id: "store-1",
				secret_name: "my-secret",
			},
			{
				type: "ratelimit" as const,
				namespace_id: "rl-123",
				simple: { limit: 100, period: 60 },
			},
			{ type: "inherit" as const },
		])("should pass through $type binding unchanged", (input, { expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_BINDING: input as NonNullable<
					StartDevWorkerInput["bindings"]
				>[string],
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_BINDING",
				...input,
			});
		});
	});

	describe("pipeline bindings", () => {
		it("should transform type from pipeline to pipelines", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_PIPELINE: { type: "pipeline", pipeline: "my-pipeline" },
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_PIPELINE",
				type: "pipelines",
				pipeline: "my-pipeline",
			});
		});
	});

	describe("singleton bindings", () => {
		it.for([
			{ bindingName: "BROWSER", type: "browser" as const },
			{ bindingName: "AI", type: "ai" as const },
			{ bindingName: "IMAGES", type: "images" as const },
			{ bindingName: "MEDIA", type: "media" as const },
			{ bindingName: "VERSION", type: "version_metadata" as const },
			{ bindingName: "ASSETS", type: "assets" as const },
		])("should include $type binding", ({ bindingName, type }, { expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				[bindingName]: { type },
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: bindingName,
				type,
			});
		});
	});

	describe("dispatch_namespace bindings", () => {
		it("should include dispatch namespace bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				DISPATCH: {
					type: "dispatch_namespace",
					namespace: "my-namespace",
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "DISPATCH",
				type: "dispatch_namespace",
				namespace: "my-namespace",
			});
		});

		it("should include outbound config for dispatch namespace", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				DISPATCH: {
					type: "dispatch_namespace",
					namespace: "my-namespace",
					outbound: {
						service: "outbound-worker",
						environment: "production",
						parameters: ["param1", "param2"],
					},
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			const dispatchBinding = getBindings(form).find(
				(b) => b.name === "DISPATCH"
			);
			expect(dispatchBinding).toMatchObject({
				name: "DISPATCH",
				type: "dispatch_namespace",
				namespace: "my-namespace",
				outbound: {
					worker: {
						service: "outbound-worker",
						environment: "production",
					},
					params: [{ name: "param1" }, { name: "param2" }],
				},
			});
		});
	});

	describe("wasm_module bindings", () => {
		it("should add wasm module as a form part and metadata binding", ({
			expect,
		}) => {
			const wasmContent = Buffer.from([0, 97, 115, 109]);
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_WASM: {
					type: "wasm_module",
					source: { contents: wasmContent },
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_WASM",
				type: "wasm_module",
				part: "MY_WASM",
			});
			const wasmPart = form.get("MY_WASM") as File;
			expect(wasmPart).not.toBeNull();
			expect(wasmPart.type).toBe("application/wasm");
		});
	});

	describe("text_blob bindings", () => {
		it("should add text blob as a form part and metadata binding", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_TEXT: {
					type: "text_blob",
					source: { contents: "hello text", path: "my-text.txt" },
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_TEXT",
				type: "text_blob",
				part: "MY_TEXT",
			});
			const textPart = form.get("MY_TEXT") as File;
			expect(textPart).not.toBeNull();
			expect(textPart.type).toBe("text/plain");
		});

		it("should not add __STATIC_CONTENT_MANIFEST as a form part", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				__STATIC_CONTENT_MANIFEST: {
					type: "text_blob",
					source: { contents: "{}", path: "__STATIC_CONTENT_MANIFEST" },
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			// The binding should still be in metadata
			expect(getBindings(form)).toContainEqual({
				name: "__STATIC_CONTENT_MANIFEST",
				type: "text_blob",
				part: "__STATIC_CONTENT_MANIFEST",
			});
			// But the form part should NOT be set (the manifest is handled specially)
			expect(form.get("__STATIC_CONTENT_MANIFEST")).toBeNull();
		});
	});

	describe("data_blob bindings", () => {
		it("should add data blob as a form part and metadata binding", ({
			expect,
		}) => {
			const blobContent = Buffer.from([1, 2, 3, 4]);
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_DATA: {
					type: "data_blob",
					source: { contents: blobContent },
				},
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			expect(getBindings(form)).toContainEqual({
				name: "MY_DATA",
				type: "data_blob",
				part: "MY_DATA",
			});
			const dataPart = form.get("MY_DATA") as File;
			expect(dataPart).not.toBeNull();
			expect(dataPart.type).toBe("application/octet-stream");
		});
	});

	describe("multiple binding types together", () => {
		it("should handle a worker with many different binding types", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_VAR: { type: "plain_text", value: "hello" },
				MY_SECRET: { type: "secret_text", value: "s3cret" },
				MY_KV: { type: "kv_namespace", id: "kv-123" },
				MY_BUCKET: { type: "r2_bucket", bucket_name: "my-bucket" },
				MY_DB: { type: "d1", database_id: "db-123" },
				AI: { type: "ai" },
				BROWSER: { type: "browser" },
			};
			const form = createWorkerUploadForm(createEsmWorker(), bindings);
			const metadataBindings = getBindings(form);
			expect(metadataBindings).toHaveLength(7);
			expect(metadataBindings.map((b) => b.type).sort()).toEqual([
				"ai",
				"browser",
				"d1",
				"kv_namespace",
				"plain_text",
				"r2_bucket",
				"secret_text",
			]);
		});
	});
});
