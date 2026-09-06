import { describe, it } from "vitest";
import { createPreviewDeploymentForm } from "../src/preview/api";
import type { FormData } from "undici";

async function readModuleParts(
	form: FormData
): Promise<Array<{ filename: string; type: string; bytes: Uint8Array }>> {
	const moduleParts = form.getAll("files");
	if (moduleParts.length === 0) {
		throw new Error("Preview deployment form has no module file parts");
	}

	return Promise.all(
		moduleParts.map(async (part) => {
			if (!(part instanceof File)) {
				throw new Error("Preview deployment module part is not a file");
			}
			return {
				filename: part.name,
				type: part.type,
				bytes: new Uint8Array(await part.arrayBuffer()),
			};
		})
	);
}

describe("createPreviewDeploymentForm", () => {
	it("keeps modules out of the metadata part", ({ expect }) => {
		const form = createPreviewDeploymentForm({
			main_module: "index.js",
			compatibility_date: "2025-01-01",
			modules: [
				{
					name: "index.js",
					content_type: "application/javascript+module",
					content: "export default {};",
				},
			],
		});

		expect(JSON.parse(form.get("metadata") as string)).toEqual({
			main_module: "index.js",
			compatibility_date: "2025-01-01",
		});
		expect(form.getAll("files")).toHaveLength(1);
	});

	it("sends each module as raw bytes under the module part name", async ({
		expect,
	}) => {
		const wasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
		const form = createPreviewDeploymentForm({
			main_module: "index.js",
			modules: [
				{
					name: "index.js",
					content_type: "application/javascript+module",
					content: "export default { fetch() {} };",
				},
				{
					name: "lib/add.wasm",
					content_type: "application/wasm",
					content: wasm,
				},
				{
					name: "index.js.map",
					content_type: "application/source-map",
					content: '{"version":3,"sources":["index.ts"]}',
				},
			],
		});

		expect(await readModuleParts(form)).toEqual([
			{
				filename: "index.js",
				type: "application/javascript+module",
				bytes: new TextEncoder().encode("export default { fetch() {} };"),
			},
			{
				filename: "lib/add.wasm",
				type: "application/wasm",
				bytes: wasm,
			},
			{
				filename: "index.js.map",
				type: "application/source-map",
				bytes: new TextEncoder().encode('{"version":3,"sources":["index.ts"]}'),
			},
		]);
	});

	it("sends only metadata when there are no modules", ({ expect }) => {
		const form = createPreviewDeploymentForm({
			compatibility_date: "2025-01-01",
		});

		expect(JSON.parse(form.get("metadata") as string)).toEqual({
			compatibility_date: "2025-01-01",
		});
		expect(form.getAll("files")).toEqual([]);
	});
});
