import { INHERIT_SYMBOL } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import {
	createFlatWorkerUploadForm,
	createWorkerUploadForm,
	fromMimeType,
	moduleTypeMimeType,
} from "../deployment-bundle/create-worker-upload-form";
import type { StartDevWorkerInput } from "../api/startDevWorker/types";
import type { CfWorkerInit } from "@cloudflare/workers-utils";

/**
 * Helper to parse the metadata JSON from a FormData upload form.
 */
function getMetadata(form: FormData): Record<string, unknown> {
	return JSON.parse(form.get("metadata") as string);
}

/**
 * Helper to create a minimal CfWorkerInit for ESM workers.
 * This is the base object that can be extended with specific bindings for each test.
 */
function createEsmWorker(
	overrides: Partial<CfWorkerInit> = {}
): Omit<CfWorkerInit, "bindings" | "rawBindings"> {
	return {
		name: "test-worker",
		main: {
			name: "index.js",
			filePath: "index.js",
			content: 'export default { fetch() { return new Response("ok"); } }',
			type: "esm",
		},
		modules: [],
		sourceMaps: [],
		compatibility_date: "2024-01-01",
		compatibility_flags: [],
		assets: undefined,
		containers: undefined,
		migrations: undefined,
		keepVars: undefined,
		keepSecrets: undefined,
		logpush: undefined,
		placement: undefined,
		tail_consumers: undefined,
		limits: undefined,
		observability: undefined,
		...overrides,
	};
}

/**
 * Helper to create a minimal CfWorkerInit for service-worker (commonjs) format workers.
 */
function createCjsWorker(
	overrides: Partial<CfWorkerInit> = {}
): Omit<CfWorkerInit, "bindings" | "rawBindings"> {
	return {
		name: "test-worker",
		main: {
			name: "index.js",
			filePath: "index.js",
			content:
				'addEventListener("fetch", (event) => event.respondWith(new Response("ok")))',
			type: "commonjs",
		},
		modules: [],
		sourceMaps: [],
		compatibility_date: "2024-01-01",
		compatibility_flags: [],
		assets: undefined,
		containers: undefined,
		migrations: undefined,
		keepVars: undefined,
		keepSecrets: undefined,
		logpush: undefined,
		placement: undefined,
		tail_consumers: undefined,
		limits: undefined,
		observability: undefined,
		...overrides,
	};
}

const emptyBindings: CfWorkerInit["bindings"] = {
	vars: undefined,
	kv_namespaces: undefined,
	send_email: undefined,
	wasm_modules: undefined,
	text_blobs: undefined,
	browser: undefined,
	ai: undefined,
	images: undefined,
	version_metadata: undefined,
	data_blobs: undefined,
	durable_objects: undefined,
	workflows: undefined,
	queues: undefined,
	r2_buckets: undefined,
	d1_databases: undefined,
	vectorize: undefined,
	hyperdrive: undefined,
	secrets_store_secrets: undefined,
	services: undefined,
	vpc_services: undefined,
	analytics_engine_datasets: undefined,
	dispatch_namespaces: undefined,
	mtls_certificates: undefined,
	logfwdr: undefined,
	pipelines: undefined,
	unsafe: undefined,
	assets: undefined,
	unsafe_hello_world: undefined,
	ratelimits: undefined,
	worker_loaders: undefined,
	media: undefined,
};

/**
 * Helper to create a full CfWorkerInit (including bindings) for the wrapper function tests.
 */
function createFullWorker(overrides: {
	bindings?: Partial<CfWorkerInit["bindings"]>;
}): CfWorkerInit {
	return {
		name: "test-worker",
		main: {
			name: "index.js",
			filePath: "index.js",
			content: 'export default { fetch() { return new Response("ok"); } }',
			type: "esm",
		},
		modules: [],
		sourceMaps: [],
		compatibility_date: "2024-01-01",
		compatibility_flags: [],
		assets: undefined,
		containers: undefined,
		migrations: undefined,
		keepVars: undefined,
		keepSecrets: undefined,
		logpush: undefined,
		placement: undefined,
		tail_consumers: undefined,
		limits: undefined,
		observability: undefined,
		bindings: {
			...emptyBindings,
			...overrides.bindings,
		},
	};
}

// ---------------------------------------------------------------------------
// moduleTypeMimeType / fromMimeType
// ---------------------------------------------------------------------------

describe("moduleTypeMimeType", () => {
	it("should map esm to application/javascript+module", ({ expect }) => {
		expect(moduleTypeMimeType["esm"]).toBe("application/javascript+module");
	});

	it("should map commonjs to application/javascript", ({ expect }) => {
		expect(moduleTypeMimeType["commonjs"]).toBe("application/javascript");
	});

	it("should map compiled-wasm to application/wasm", ({ expect }) => {
		expect(moduleTypeMimeType["compiled-wasm"]).toBe("application/wasm");
	});

	it("should map buffer to application/octet-stream", ({ expect }) => {
		expect(moduleTypeMimeType["buffer"]).toBe("application/octet-stream");
	});

	it("should map text to text/plain", ({ expect }) => {
		expect(moduleTypeMimeType["text"]).toBe("text/plain");
	});

	it("should map python to text/x-python", ({ expect }) => {
		expect(moduleTypeMimeType["python"]).toBe("text/x-python");
	});

	it("should map python-requirement to text/x-python-requirement", ({
		expect,
	}) => {
		expect(moduleTypeMimeType["python-requirement"]).toBe(
			"text/x-python-requirement"
		);
	});
});

describe("fromMimeType", () => {
	it("should reverse-map application/javascript+module to esm", ({
		expect,
	}) => {
		expect(fromMimeType("application/javascript+module")).toBe("esm");
	});

	it("should reverse-map application/javascript to commonjs", ({ expect }) => {
		expect(fromMimeType("application/javascript")).toBe("commonjs");
	});

	it("should reverse-map application/wasm to compiled-wasm", ({ expect }) => {
		expect(fromMimeType("application/wasm")).toBe("compiled-wasm");
	});

	it("should reverse-map application/octet-stream to buffer", ({ expect }) => {
		expect(fromMimeType("application/octet-stream")).toBe("buffer");
	});

	it("should throw for unsupported mime types", ({ expect }) => {
		expect(() => fromMimeType("image/png")).toThrowError(
			"Unsupported mime type: image/png"
		);
	});
});

// ---------------------------------------------------------------------------
// createFlatWorkerUploadForm
// ---------------------------------------------------------------------------

describe("createFlatWorkerUploadForm", () => {
	describe("basic structure", () => {
		it("should set main_module for ESM workers", ({ expect }) => {
			const form = createFlatWorkerUploadForm(createEsmWorker(), {});
			const metadata = getMetadata(form);
			expect(metadata.main_module).toBe("index.js");
			expect(metadata.body_part).toBeUndefined();
		});

		it("should set body_part for commonjs workers", ({ expect }) => {
			const form = createFlatWorkerUploadForm(createCjsWorker(), {});
			const metadata = getMetadata(form);
			expect(metadata.body_part).toBe("index.js");
			expect(metadata.main_module).toBeUndefined();
		});

		it("should include the main module as a form part", ({ expect }) => {
			const form = createFlatWorkerUploadForm(createEsmWorker(), {});
			const mainPart = form.get("index.js") as File;
			expect(mainPart).not.toBeNull();
			expect(mainPart.type).toBe("application/javascript+module");
		});

		it("should include compatibility_date and compatibility_flags", ({
			expect,
		}) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker({
					compatibility_date: "2024-06-01",
					compatibility_flags: ["nodejs_compat"],
				}),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata.compatibility_date).toBe("2024-06-01");
			expect(metadata.compatibility_flags).toEqual(["nodejs_compat"]);
		});

		it("should include source maps as form parts", ({ expect }) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker({
					sourceMaps: [
						{
							name: "index.js.map",
							content: '{"version":3}',
						},
					],
				}),
				{}
			);
			const mapPart = form.get("index.js.map") as File;
			expect(mapPart).not.toBeNull();
			expect(mapPart.type).toBe("application/source-map");
		});

		it("should include additional ESM modules as form parts", ({ expect }) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker({
					modules: [
						{
							name: "utils.js",
							filePath: "utils.js",
							content: "export const foo = 1;",
							type: "esm",
						},
					],
				}),
				{}
			);
			const utilsPart = form.get("utils.js") as File;
			expect(utilsPart).not.toBeNull();
			expect(utilsPart.type).toBe("application/javascript+module");
		});

		it("should throw when commonjs worker has additional modules", ({
			expect,
		}) => {
			expect(() =>
				createFlatWorkerUploadForm(
					createCjsWorker({
						modules: [
							{
								name: "extra.js",
								filePath: "extra.js",
								content: "module.exports = {};",
								type: "commonjs",
							},
						],
					}),
					{}
				)
			).toThrowError(
				"More than one module can only be specified when type = 'esm'"
			);
		});
	});

	describe("plain_text / json / secret_text bindings", () => {
		it("should include plain_text vars in metadata bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_VAR: { type: "plain_text", value: "hello" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_VAR",
				type: "plain_text",
				text: "hello",
			});
		});

		it("should include json bindings in metadata bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_JSON: { type: "json", value: { foo: "bar" } },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_JSON",
				type: "json",
				json: { foo: "bar" },
			});
		});

		it("should include secret_text bindings in metadata bindings", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_SECRET: { type: "secret_text", value: "s3cret" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_SECRET",
				type: "secret_text",
				text: "s3cret",
			});
		});
	});

	describe("kv_namespace bindings", () => {
		it("should include KV bindings with an ID", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_KV: { type: "kv_namespace", id: "abc123" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
				createFlatWorkerUploadForm(createEsmWorker(), bindings)
			).toThrowError('MY_KV bindings must have an "id" field');
		});

		it("should convert KV namespace to inherit binding during dry run when ID is missing", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_KV: { type: "kv_namespace" } as never,
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings, {
				dryRun: true,
			});
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
				createFlatWorkerUploadForm(createEsmWorker(), bindings)
			).toThrowError('MY_BUCKET bindings must have a "bucket_name" field');
		});

		it("should convert R2 bucket to inherit binding during dry run when bucket_name is missing", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_BUCKET: { type: "r2_bucket" } as never,
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings, {
				dryRun: true,
			});
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
				createFlatWorkerUploadForm(createEsmWorker(), bindings)
			).toThrowError('MY_DB bindings must have a "database_id" field');
		});

		it("should convert D1 to inherit binding during dry run when database_id is missing", ({
			expect,
		}) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_DB: { type: "d1" } as never,
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings, {
				dryRun: true,
			});
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			const doBinding = metadataBindings.find((b) => b.name === "MY_DO");
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_WORKFLOW",
				type: "workflow",
				workflow_name: "my-workflow",
				class_name: "MyWorkflow",
				script_name: "workflow-worker",
			});
		});
	});

	describe("vectorize bindings", () => {
		it("should include vectorize bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_INDEX: { type: "vectorize", index_name: "my-index" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_INDEX",
				type: "vectorize",
				index_name: "my-index",
			});
		});
	});

	describe("hyperdrive bindings", () => {
		it("should include hyperdrive bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_HYPERDRIVE: { type: "hyperdrive", id: "hd-123" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_HYPERDRIVE",
				type: "hyperdrive",
				id: "hd-123",
			});
		});
	});

	describe("analytics_engine bindings", () => {
		it("should include analytics engine bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_AE: { type: "analytics_engine", dataset: "my-dataset" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_AE",
				type: "analytics_engine",
				dataset: "my-dataset",
			});
		});
	});

	describe("mtls_certificate bindings", () => {
		it("should include mTLS certificate bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_CERT: { type: "mtls_certificate", certificate_id: "cert-123" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_CERT",
				type: "mtls_certificate",
				certificate_id: "cert-123",
			});
		});
	});

	describe("pipeline bindings", () => {
		it("should include pipeline bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_PIPELINE: { type: "pipeline", pipeline: "my-pipeline" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_PIPELINE",
				type: "pipelines",
				pipeline: "my-pipeline",
			});
		});
	});

	describe("secrets_store_secret bindings", () => {
		it("should include secrets store bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_STORE_SECRET: {
					type: "secrets_store_secret",
					store_id: "store-1",
					secret_name: "my-secret",
				},
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_STORE_SECRET",
				type: "secrets_store_secret",
				store_id: "store-1",
				secret_name: "my-secret",
			});
		});
	});

	describe("singleton bindings (browser, ai, images, media, version_metadata, assets)", () => {
		it("should include browser binding", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				BROWSER: { type: "browser" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "BROWSER",
				type: "browser",
			});
		});

		it("should include AI binding", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				AI: { type: "ai" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "AI",
				type: "ai",
			});
		});

		it("should include images binding", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				IMAGES: { type: "images" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "IMAGES",
				type: "images",
			});
		});

		it("should include media binding", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MEDIA: { type: "media" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MEDIA",
				type: "media",
			});
		});

		it("should include version_metadata binding", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				VERSION: { type: "version_metadata" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "VERSION",
				type: "version_metadata",
			});
		});

		it("should include assets binding", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				ASSETS: { type: "assets" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "ASSETS",
				type: "assets",
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			const dispatchBinding = metadataBindings.find(
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

	describe("ratelimit bindings", () => {
		it("should include rate limit bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				MY_RATELIMIT: {
					type: "ratelimit",
					namespace_id: "rl-123",
					simple: { limit: 100, period: 60 },
				},
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_RATELIMIT",
				type: "ratelimit",
				namespace_id: "rl-123",
				simple: { limit: 100, period: 60 },
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			// The binding should still be in metadata
			expect(metadataBindings).toContainEqual({
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "MY_DATA",
				type: "data_blob",
				part: "MY_DATA",
			});
			const dataPart = form.get("MY_DATA") as File;
			expect(dataPart).not.toBeNull();
			expect(dataPart.type).toBe("application/octet-stream");
		});
	});

	describe("inherit bindings", () => {
		it("should include inherit bindings", ({ expect }) => {
			const bindings: StartDevWorkerInput["bindings"] = {
				INHERITED: { type: "inherit" },
			};
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "INHERITED",
				type: "inherit",
			});
		});
	});

	describe("keep_bindings", () => {
		it("should include plain_text and json in keep_bindings when keepVars is true", ({
			expect,
		}) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker({ keepVars: true }),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata.keep_bindings).toEqual(["plain_text", "json"]);
		});

		it("should include secret_text and secret_key in keep_bindings when keepSecrets is true", ({
			expect,
		}) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker({ keepSecrets: true }),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata.keep_bindings).toEqual(["secret_text", "secret_key"]);
		});

		it("should combine keepVars, keepSecrets, and keepBindings", ({
			expect,
		}) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker({
					keepVars: true,
					keepSecrets: true,
					keepBindings: ["kv_namespace"],
				}),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata.keep_bindings).toEqual([
				"plain_text",
				"json",
				"secret_text",
				"secret_key",
				"kv_namespace",
			]);
		});

		it("should not include keep_bindings when none of keepVars/keepSecrets/keepBindings are set", ({
			expect,
		}) => {
			const form = createFlatWorkerUploadForm(createEsmWorker(), {});
			const metadata = getMetadata(form);
			expect(metadata.keep_bindings).toBeUndefined();
		});
	});

	describe("optional metadata fields", () => {
		it("should include logpush when specified", ({ expect }) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker({ logpush: true }),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata.logpush).toBe(true);
		});

		it("should include placement when specified", ({ expect }) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker({ placement: { mode: "smart" } }),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata.placement).toEqual({ mode: "smart" });
		});

		it("should include tail_consumers when specified", ({ expect }) => {
			const consumers = [{ service: "tail-worker" }];
			const form = createFlatWorkerUploadForm(
				createEsmWorker({ tail_consumers: consumers }),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata.tail_consumers).toEqual(consumers);
		});

		it("should include limits when specified", ({ expect }) => {
			const limits = { cpu_ms: 50 };
			const form = createFlatWorkerUploadForm(createEsmWorker({ limits }), {});
			const metadata = getMetadata(form);
			expect(metadata.limits).toEqual(limits);
		});

		it("should include observability when specified", ({ expect }) => {
			const observability = { enabled: true };
			const form = createFlatWorkerUploadForm(
				createEsmWorker({ observability }),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata.observability).toEqual(observability);
		});

		it("should include containers when specified", ({ expect }) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker({
					containers: [
						{ class_name: "MyContainer" },
					] as CfWorkerInit["containers"],
				}),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata.containers).toEqual([{ class_name: "MyContainer" }]);
		});

		it("should include annotations when specified", ({ expect }) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker({
					annotations: {
						"workers/message": "deploy note",
						"workers/tag": "v1.0",
					},
				}),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata.annotations).toEqual({
				"workers/message": "deploy note",
				"workers/tag": "v1.0",
			});
		});
	});

	describe("unsafe metadata", () => {
		it("should merge unsafe metadata into the metadata object", ({
			expect,
		}) => {
			const form = createFlatWorkerUploadForm(
				createEsmWorker(),
				{},
				{
					unsafe: { metadata: { custom_key: "custom_value" } },
				}
			);
			const metadata = getMetadata(form);
			expect(metadata.custom_key).toBe("custom_value");
		});
	});

	describe("static assets only (no user worker)", () => {
		it("should short-circuit for assets-only uploads", ({ expect }) => {
			const worker = createEsmWorker({
				assets: {
					routerConfig: { has_user_worker: false },
					jwt: "test-jwt",
					assetConfig: {
						html_handling: "auto-trailing-slash",
						not_found_handling: "single-page-application",
					},
				} as CfWorkerInit["assets"],
			});
			const form = createFlatWorkerUploadForm(worker, {});
			const metadata = getMetadata(form);
			expect(metadata.assets).toEqual({
				jwt: "test-jwt",
				config: {
					html_handling: "auto-trailing-slash",
					not_found_handling: "single-page-application",
				},
			});
			// Should NOT have main_module or bindings
			expect(metadata.main_module).toBeUndefined();
			expect(metadata.bindings).toBeUndefined();
			// Should NOT have the main module as a form part
			expect(form.get("index.js")).toBeNull();
		});

		it("should include compatibility_date in assets-only metadata when provided", ({
			expect,
		}) => {
			const worker = createEsmWorker({
				compatibility_date: "2024-06-01",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					routerConfig: { has_user_worker: false },
					jwt: "test-jwt",
				} as CfWorkerInit["assets"],
			});
			const form = createFlatWorkerUploadForm(worker, {});
			const metadata = getMetadata(form);
			expect(metadata.compatibility_date).toBe("2024-06-01");
			expect(metadata.compatibility_flags).toEqual(["nodejs_compat"]);
		});
	});

	describe("__STATIC_CONTENT_MANIFEST in ESM with subdirectories", () => {
		it("should add re-export stubs in subdirectories for the manifest module", ({
			expect,
		}) => {
			const worker = createEsmWorker({
				modules: [
					{
						name: "__STATIC_CONTENT_MANIFEST",
						filePath: "__STATIC_CONTENT_MANIFEST",
						content: "{}",
						type: "esm",
					},
					{
						name: "lib/utils.js",
						filePath: "lib/utils.js",
						content: "export const x = 1;",
						type: "esm",
					},
				],
			});
			const form = createFlatWorkerUploadForm(worker, {});
			// The re-export stub should have been appended for the "lib" directory
			const stubPart = form.get("lib/__STATIC_CONTENT_MANIFEST") as File;
			expect(stubPart).not.toBeNull();
		});
	});

	describe("commonjs service-worker format handling", () => {
		it("should convert wasm modules to wasm_module bindings in commonjs format", ({
			expect,
		}) => {
			const worker = createCjsWorker({
				modules: [
					{
						name: "add.wasm",
						filePath: "add.wasm",
						content: Buffer.from([0, 97, 115, 109]),
						type: "compiled-wasm",
					},
				],
			});
			// Override modules to empty array since we want the module conversion to handle it
			// Actually we need to set modules WITH the wasm module
			const form = createFlatWorkerUploadForm(worker, {});
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			// The wasm module should have been converted to a binding
			expect(metadataBindings).toContainEqual({
				name: "add_wasm",
				type: "wasm_module",
				part: "add_wasm",
			});
			// And added as a form part
			const wasmPart = form.get("add_wasm") as File;
			expect(wasmPart).not.toBeNull();
			expect(wasmPart.type).toBe("application/wasm");
		});

		it("should convert text modules to text_blob bindings in commonjs format", ({
			expect,
		}) => {
			const worker = createCjsWorker({
				modules: [
					{
						name: "template.txt",
						filePath: "template.txt",
						content: "Hello {{name}}",
						type: "text",
					},
				],
			});
			const form = createFlatWorkerUploadForm(worker, {});
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "template_txt",
				type: "text_blob",
				part: "template_txt",
			});
		});

		it("should convert buffer modules to data_blob bindings in commonjs format", ({
			expect,
		}) => {
			const worker = createCjsWorker({
				modules: [
					{
						name: "data.bin",
						filePath: "data.bin",
						content: Buffer.from([1, 2, 3]),
						type: "buffer",
					},
				],
			});
			const form = createFlatWorkerUploadForm(worker, {});
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
			expect(metadataBindings).toContainEqual({
				name: "data_bin",
				type: "data_blob",
				part: "data_bin",
			});
		});

		it("should handle __STATIC_CONTENT_MANIFEST in commonjs format", ({
			expect,
		}) => {
			const worker = createCjsWorker({
				modules: [
					{
						name: "__STATIC_CONTENT_MANIFEST",
						filePath: "__STATIC_CONTENT_MANIFEST",
						content: "{}",
						type: "text",
					},
				],
			});
			const form = createFlatWorkerUploadForm(worker, {});
			// Manifest should be added as form part
			const manifestPart = form.get("__STATIC_CONTENT_MANIFEST") as File;
			expect(manifestPart).not.toBeNull();
			expect(manifestPart.type).toBe("text/plain");
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
			const form = createFlatWorkerUploadForm(createEsmWorker(), bindings);
			const metadata = getMetadata(form);
			const metadataBindings = metadata.bindings as Array<
				Record<string, unknown>
			>;
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

// ---------------------------------------------------------------------------
// createWorkerUploadForm (wrapper that converts CfWorkerInit bindings)
// ---------------------------------------------------------------------------

describe("createWorkerUploadForm", () => {
	it("should convert CfWorkerInit bindings and produce a valid form", ({
		expect,
	}) => {
		const worker = createFullWorker({
			bindings: {
				vars: { MY_VAR: "hello" },
				kv_namespaces: [{ binding: "MY_KV", id: "kv-123" }],
				d1_databases: [{ binding: "MY_DB", database_id: "db-123" }],
				r2_buckets: [{ binding: "MY_BUCKET", bucket_name: "my-bucket" }],
			},
		});
		const form = createWorkerUploadForm(worker);
		const metadata = getMetadata(form);
		const metadataBindings = metadata.bindings as Array<
			Record<string, unknown>
		>;
		expect(metadataBindings).toContainEqual({
			name: "MY_VAR",
			type: "plain_text",
			text: "hello",
		});
		expect(metadataBindings).toContainEqual({
			name: "MY_KV",
			type: "kv_namespace",
			namespace_id: "kv-123",
		});
		expect(metadataBindings).toContainEqual({
			name: "MY_DB",
			type: "d1",
			id: "db-123",
		});
		expect(metadataBindings).toContainEqual({
			name: "MY_BUCKET",
			type: "r2_bucket",
			bucket_name: "my-bucket",
		});
	});

	it("should handle dryRun option", ({ expect }) => {
		const worker = createFullWorker({
			bindings: {
				kv_namespaces: [{ binding: "MY_KV" }],
			},
		});
		// Without dryRun this would throw
		const form = createWorkerUploadForm(worker, { dryRun: true });
		const metadata = getMetadata(form);
		const metadataBindings = metadata.bindings as Array<
			Record<string, unknown>
		>;
		// KV with no ID should become inherit during dry run
		expect(metadataBindings).toContainEqual({
			name: "MY_KV",
			type: "inherit",
		});
	});

	it("should handle durable_objects bindings", ({ expect }) => {
		const worker = createFullWorker({
			bindings: {
				durable_objects: {
					bindings: [
						{
							name: "MY_DO",
							class_name: "MyDurableObject",
						},
					],
				},
			},
		});
		const form = createWorkerUploadForm(worker);
		const metadata = getMetadata(form);
		const metadataBindings = metadata.bindings as Array<
			Record<string, unknown>
		>;
		expect(metadataBindings).toContainEqual({
			name: "MY_DO",
			type: "durable_object_namespace",
			class_name: "MyDurableObject",
		});
	});

	it("should handle services bindings", ({ expect }) => {
		const worker = createFullWorker({
			bindings: {
				services: [
					{
						binding: "AUTH",
						service: "auth-worker",
					},
				],
			},
		});
		const form = createWorkerUploadForm(worker);
		const metadata = getMetadata(form);
		const metadataBindings = metadata.bindings as Array<
			Record<string, unknown>
		>;
		expect(metadataBindings).toContainEqual({
			name: "AUTH",
			type: "service",
			service: "auth-worker",
		});
	});

	it("should handle JSON vars", ({ expect }) => {
		const worker = createFullWorker({
			bindings: {
				vars: {
					STR_VAR: "hello",
					JSON_VAR: { nested: true },
				},
			},
		});
		const form = createWorkerUploadForm(worker);
		const metadata = getMetadata(form);
		const metadataBindings = metadata.bindings as Array<
			Record<string, unknown>
		>;
		expect(metadataBindings).toContainEqual({
			name: "STR_VAR",
			type: "plain_text",
			text: "hello",
		});
		expect(metadataBindings).toContainEqual({
			name: "JSON_VAR",
			type: "json",
			json: { nested: true },
		});
	});
});
