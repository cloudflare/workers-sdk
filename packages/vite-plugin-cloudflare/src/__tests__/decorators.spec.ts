import * as esbuild from "esbuild";
import { describe, test } from "vitest";
import {
	decoratorsTransformFilter,
	lowerDecorators,
} from "../plugins/decorators";

describe("lowerDecorators", () => {
	test.for([
		["method", "class A { @dec m() {} }"],
		["field", "class A { @dec x = 1; }"],
		["accessor", "class A { @dec accessor x = 1; }"],
		["decorator call", "class A { @dec() m() {} }"],
		["member expression", "class A { @a.b m() {} }"],
		["parenthesised expression", "class A { @(a[0]) m() {} }"],
		["exported class", "export @dec class A {}"],
		["class expression", "const A = @dec class {};"],
		["whitespace-separated", "class A { @ dec m() {} }"],
		["comment-separated", "class A { @/* note */dec m() {} }"],
		[
			"URL-preceded",
			'const url = "https://example.com"; class A { @dec m() {} }',
		],
	] as const)("lowers a %s decorator", async ([, code], { expect }) => {
		const result = await lowerDecorators(code, "/src/index.js");

		expect(result?.code).toContain("__decoratorStart(");
		expect(result?.code).not.toMatch(/@(dec|a\.b|\()/);
		expect(JSON.parse(result?.map ?? "{}")).toMatchObject({
			sources: ["/src/index.js"],
		});
	});

	test.for([
		["email address", 'const email = "someone@example.com";'],
		["JSDoc tag", "/**\n * @param x\n */\nfunction f(x) {}"],
		["line comment", "// @ts-ignore\nconst x = 1;"],
		["decorator-like string", 'const s = "class A { @dec m() {} }";'],
		["no @", "export default {};"],
	] as const)(
		"leaves a module with an %s unchanged",
		async ([, code], { expect }) => {
			expect(await lowerDecorators(code, "/src/index.js")).toBeUndefined();
		}
	);

	test.for([
		"/src/styles.css",
		"/src/index.html",
		"/src/data.json",
		"/src/styles.css?inline",
	])("ignores non-script module %s", async (id, { expect }) => {
		expect(decoratorsTransformFilter.id.test(id)).toBe(false);
		expect(
			await lowerDecorators("class A { @dec m() {} }", id)
		).toBeUndefined();
	});

	// Vite adds `?v=` to pre-bundled dependencies.
	test.for([
		"/node_modules/.vite/deps/dep.js?v=286b26a0",
		"/src/index.ts#hash",
	])("lowers decorators in module %s", async (id, { expect }) => {
		expect(decoratorsTransformFilter.id.test(id)).toBe(true);
		expect(
			(await lowerDecorators("class A { @dec m() {} }", id))?.code
		).toContain("__decoratorStart(");
	});

	test.for([
		["with a decorator", "class A { @dec m() {} }\nexports.A = A;"],
		[
			"already lowered by esbuild",
			esbuild.transformSync("class A { @dec m() {} }\nexports.A = A;", {
				format: "cjs",
				supported: { decorators: false },
			}).code,
		],
	])("keeps a CommonJS module %s as CommonJS", async ([, code], { expect }) => {
		const result = await lowerDecorators(code, "/src/index.js");

		expect(result?.code ?? code).toContain("exports.A = A;");
		expect(result?.code ?? code).not.toMatch(/^export /m);
	});

	test("does not lower syntax outside decorated classes", async ({
		expect,
	}) => {
		const result = await lowerDecorators(
			"class A { @dec m() {} }\nclass B { #x; static { B.y ??= 2; } }",
			"/src/index.js"
		);

		expect(result?.code).toContain("#x;");
		expect(result?.code).toContain("static {");
		expect(result?.code).toContain("??=");
	});
});
