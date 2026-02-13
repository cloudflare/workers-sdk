import { describe, it } from "vitest";
import { createWorkerUploadForm } from "../../deployment-bundle/create-worker-upload-form";
import { createCjsWorker, createEsmWorker, getMetadata } from "./helpers";
import type { CfWorkerInit } from "./helpers";

describe("createWorkerUploadForm — basic structure", () => {
	it("should set main_module for ESM workers", ({ expect }) => {
		const form = createWorkerUploadForm(createEsmWorker(), {});
		const metadata = getMetadata(form);
		expect(metadata.main_module).toBe("index.js");
		expect(metadata.body_part).toBeUndefined();
	});

	it("should set body_part for commonjs workers", ({ expect }) => {
		const form = createWorkerUploadForm(createCjsWorker(), {});
		const metadata = getMetadata(form);
		expect(metadata.body_part).toBe("index.js");
		expect(metadata.main_module).toBeUndefined();
	});

	it("should include the main module as a form part", ({ expect }) => {
		const form = createWorkerUploadForm(createEsmWorker(), {});
		const mainPart = form.get("index.js") as File;
		expect(mainPart).not.toBeNull();
		expect(mainPart.type).toBe("application/javascript+module");
	});

	it("should include compatibility_date and compatibility_flags", ({
		expect,
	}) => {
		const form = createWorkerUploadForm(
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
		const form = createWorkerUploadForm(
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
		const form = createWorkerUploadForm(
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
			createWorkerUploadForm(
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

describe("createWorkerUploadForm — keep_bindings", () => {
	it("should include plain_text and json in keep_bindings when keepVars is true", ({
		expect,
	}) => {
		const form = createWorkerUploadForm(
			createEsmWorker({ keepVars: true }),
			{}
		);
		const metadata = getMetadata(form);
		expect(metadata.keep_bindings).toEqual(["plain_text", "json"]);
	});

	it("should include secret_text and secret_key in keep_bindings when keepSecrets is true", ({
		expect,
	}) => {
		const form = createWorkerUploadForm(
			createEsmWorker({ keepSecrets: true }),
			{}
		);
		const metadata = getMetadata(form);
		expect(metadata.keep_bindings).toEqual(["secret_text", "secret_key"]);
	});

	it("should combine keepVars, keepSecrets, and keepBindings", ({ expect }) => {
		const form = createWorkerUploadForm(
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
		const form = createWorkerUploadForm(createEsmWorker(), {});
		const metadata = getMetadata(form);
		expect(metadata.keep_bindings).toBeUndefined();
	});
});

describe("createWorkerUploadForm — optional metadata fields", () => {
	it.for([
		{
			label: "logpush",
			overrides: { logpush: true },
			key: "logpush",
			expected: true,
		},
		{
			label: "placement",
			overrides: { placement: { mode: "smart" } },
			key: "placement",
			expected: { mode: "smart" },
		},
		{
			label: "tail_consumers",
			overrides: { tail_consumers: [{ service: "tail-worker" }] },
			key: "tail_consumers",
			expected: [{ service: "tail-worker" }],
		},
		{
			label: "limits",
			overrides: { limits: { cpu_ms: 50 } },
			key: "limits",
			expected: { cpu_ms: 50 },
		},
		{
			label: "observability",
			overrides: { observability: { enabled: true } },
			key: "observability",
			expected: { enabled: true },
		},
		{
			label: "annotations",
			overrides: {
				annotations: {
					"workers/message": "deploy note",
					"workers/tag": "v1.0",
				},
			},
			key: "annotations",
			expected: {
				"workers/message": "deploy note",
				"workers/tag": "v1.0",
			},
		},
	])(
		"should include $label when specified",
		({ overrides, key, expected }, { expect }) => {
			const form = createWorkerUploadForm(
				createEsmWorker(overrides as Partial<CfWorkerInit>),
				{}
			);
			const metadata = getMetadata(form);
			expect(metadata[key]).toEqual(expected);
		}
	);

	it("should include containers when specified", ({ expect }) => {
		const form = createWorkerUploadForm(
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
});

describe("createWorkerUploadForm — unsafe metadata", () => {
	it("should merge unsafe metadata into the metadata object", ({ expect }) => {
		const form = createWorkerUploadForm(
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

describe("createWorkerUploadForm — static assets only", () => {
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
		const form = createWorkerUploadForm(worker, {});
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
		const form = createWorkerUploadForm(worker, {});
		const metadata = getMetadata(form);
		expect(metadata.compatibility_date).toBe("2024-06-01");
		expect(metadata.compatibility_flags).toEqual(["nodejs_compat"]);
	});
});
