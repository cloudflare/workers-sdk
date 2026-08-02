import { describe, it } from "vitest";
import {
	getExperimentalCommonJsModuleName,
	isExperimentalCommonJsModuleReference,
} from "../plugins/commonjs-module-registry";

describe("experimental CommonJS module references", () => {
	it("finds direct and workerd file URL references", ({ expect }) => {
		const emittedName = "__cloudflare_cjs__/abc/package/index.js";
		const reference = `__CLOUDFLARE_CJS_MODULE__/worker/${emittedName}`;

		expect(getExperimentalCommonJsModuleName(reference)).toBe(emittedName);
		expect(
			getExperimentalCommonJsModuleName(`file:///bundle/${reference}`)
		).toBe(emittedName);
		expect(isExperimentalCommonJsModuleReference("ordinary-package")).toBe(
			false
		);
	});
});
