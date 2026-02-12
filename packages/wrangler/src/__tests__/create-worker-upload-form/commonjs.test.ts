import { describe, it } from "vitest";
import { createWorkerUploadForm } from "../../deployment-bundle/create-worker-upload-form";
import { createCjsWorker, createEsmWorker, getBindings } from "./helpers";

describe("createWorkerUploadForm — commonjs service-worker format", () => {
	it.for([
		{
			label: "wasm → wasm_module",
			module: {
				name: "add.wasm",
				filePath: "add.wasm",
				content: Buffer.from([0, 97, 115, 109]),
				type: "compiled-wasm" as const,
			},
			expectedBinding: {
				name: "add_wasm",
				type: "wasm_module",
				part: "add_wasm",
			},
			expectedPartName: "add_wasm",
			expectedMime: "application/wasm",
		},
		{
			label: "text → text_blob",
			module: {
				name: "template.txt",
				filePath: "template.txt",
				content: "Hello {{name}}",
				type: "text" as const,
			},
			expectedBinding: {
				name: "template_txt",
				type: "text_blob",
				part: "template_txt",
			},
			expectedPartName: "template_txt",
			expectedMime: "text/plain",
		},
		{
			label: "buffer → data_blob",
			module: {
				name: "data.bin",
				filePath: "data.bin",
				content: Buffer.from([1, 2, 3]),
				type: "buffer" as const,
			},
			expectedBinding: {
				name: "data_bin",
				type: "data_blob",
				part: "data_bin",
			},
			expectedPartName: "data_bin",
			expectedMime: "application/octet-stream",
		},
	])(
		"should convert $label bindings in commonjs format",
		(
			{ module, expectedBinding, expectedPartName, expectedMime },
			{ expect }
		) => {
			const worker = createCjsWorker({ modules: [module] });
			const form = createWorkerUploadForm(worker, {});
			expect(getBindings(form)).toContainEqual(expectedBinding);
			const part = form.get(expectedPartName) as File;
			expect(part).not.toBeNull();
			expect(part.type).toBe(expectedMime);
		}
	);

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
		const form = createWorkerUploadForm(worker, {});
		const manifestPart = form.get("__STATIC_CONTENT_MANIFEST") as File;
		expect(manifestPart).not.toBeNull();
		expect(manifestPart.type).toBe("text/plain");
	});
});

describe("createWorkerUploadForm — __STATIC_CONTENT_MANIFEST ESM subdirectories", () => {
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
		const form = createWorkerUploadForm(worker, {});
		// The re-export stub should have been appended for the "lib" directory
		const stubPart = form.get("lib/__STATIC_CONTENT_MANIFEST") as File;
		expect(stubPart).not.toBeNull();
	});
});
