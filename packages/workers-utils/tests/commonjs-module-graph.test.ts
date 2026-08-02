import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	experimental_classifyJavaScriptFile,
	experimental_createCommonJsGraph,
} from "../src/commonjs-module-graph";
import { removeDirSync } from "../src/fs-helpers";

describe("experimental CommonJS module graph", () => {
	let tempDirectory: string;

	beforeEach(() => {
		tempDirectory = fs.mkdtempSync(
			path.join(os.tmpdir(), "workers-cjs-graph-")
		);
	});

	afterEach(() => {
		removeDirSync(tempDirectory);
	});

	function write(relativePath: string, contents: string): string {
		const filePath = path.join(tempDirectory, relativePath);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, contents);
		return filePath;
	}

	function writePackage(
		relativeDirectory: string,
		name: string,
		type?: "commonjs" | "module"
	): string {
		const packageDirectory = path.join(tempDirectory, relativeDirectory);
		write(
			path.join(relativeDirectory, "package.json"),
			JSON.stringify({ name, ...(type === undefined ? {} : { type }) })
		);
		return packageDirectory;
	}

	it("classifies extensions and the nearest package type", async ({
		expect,
	}) => {
		const packageDirectory = writePackage("node_modules/pkg", "pkg", "module");
		const cjs = write("node_modules/pkg/index.cjs", "");
		const mjs = write("node_modules/pkg/index.mjs", "");
		const esmJs = write("node_modules/pkg/index.js", "");
		write(
			"node_modules/pkg/lib/package.json",
			JSON.stringify({ type: "commonjs" })
		);
		const cjsJs = write("node_modules/pkg/lib/nested/index.js", "");

		expect(packageDirectory).toBe(path.dirname(esmJs));
		await expect(experimental_classifyJavaScriptFile(cjs)).resolves.toBe(
			"commonjs"
		);
		await expect(experimental_classifyJavaScriptFile(mjs)).resolves.toBe(
			"esmodule"
		);
		await expect(experimental_classifyJavaScriptFile(esmJs)).resolves.toBe(
			"esmodule"
		);
		await expect(experimental_classifyJavaScriptFile(cjsJs)).resolves.toBe(
			"commonjs"
		);
	});

	it("preserves package directories and rewrites relative requires", async ({
		expect,
	}) => {
		writePackage("node_modules/pkg", "pkg");
		const root = write(
			"node_modules/pkg/lib/entry.cjs",
			`module.exports = require("../shared/value.cjs");`
		);
		const dependency = write(
			"node_modules/pkg/shared/value.cjs",
			"module.exports = 42;"
		);
		const graph = await experimental_createCommonJsGraph({
			resolve: async (specifier, importer) =>
				path.resolve(path.dirname(importer), specifier),
		}).discover(root);
		const dependencyModule = graph.modules.find(
			(module) => module.sourcePath === dependency
		);

		expect(graph.modules).toHaveLength(2);
		expect(graph.root.emittedName).toMatch(
			/^__cloudflare_cjs__\/[a-f0-9]{10}\/pkg\/lib\/entry\.cjs$/
		);
		expect(dependencyModule?.emittedName).toMatch(
			/^__cloudflare_cjs__\/[a-f0-9]{10}\/pkg\/shared\/value\.cjs$/
		);
		expect(graph.root.transformedSource).toBe(
			`module.exports = require("../shared/value.cjs");`
		);
	});

	it("delegates extensionless resolution to the caller", async ({ expect }) => {
		writePackage("node_modules/pkg", "pkg");
		const root = write(
			"node_modules/pkg/index.cjs",
			`module.exports = require("./value");`
		);
		const dependency = write(
			"node_modules/pkg/value.js",
			"module.exports = 1;"
		);
		const resolve = vi.fn(async () => dependency);
		const graph = await experimental_createCommonJsGraph({ resolve }).discover(
			root
		);

		expect(resolve).toHaveBeenCalledWith("./value", root);
		expect(graph.root.transformedSource).toContain('require("./value.js")');
	});

	it("converts required JSON to CommonJS source", async ({ expect }) => {
		writePackage("node_modules/pkg", "pkg");
		const root = write(
			"node_modules/pkg/index.cjs",
			`module.exports = require("./data.json");`
		);
		const jsonSource = '{"answer":42,"__proto__":{"safe":true}}';
		const json = write("node_modules/pkg/data.json", jsonSource);
		const graph = await experimental_createCommonJsGraph({
			resolve: async () => json,
		}).discover(root);
		const jsonModule = graph.modules.find(
			(module) => module.sourcePath === json
		);

		expect(jsonModule).toMatchObject({ sourceType: "commonjs" });
		expect(jsonModule?.transformedSource).toBe(
			`module.exports = JSON.parse(${JSON.stringify(jsonSource)});\n`
		);
	});

	it("leaves Node builtins and non-global require calls untouched", async ({
		expect,
	}) => {
		writePackage("node_modules/pkg", "pkg");
		const source = [
			`const fs = require("node:fs");`,
			`const path = require("path");`,
			`object.require("./not-a-dependency");`,
			`function useLocal(require, name) { return require(name); }`,
		].join("\n");
		const root = write("node_modules/pkg/index.cjs", source);
		const resolve = vi.fn();
		const graph = await experimental_createCommonJsGraph({ resolve }).discover(
			root
		);

		expect(resolve).not.toHaveBeenCalled();
		expect(graph.root.transformedSource).toBe(source);
	});

	it("supports optional catch bindings", async ({ expect }) => {
		writePackage("node_modules/pkg", "pkg");
		const root = write(
			"node_modules/pkg/index.cjs",
			`try { require("./child.cjs"); } catch {}`
		);
		const child = write(
			"node_modules/pkg/child.cjs",
			`module.exports = "child";`
		);
		const graph = await experimental_createCommonJsGraph({
			resolve: async () => child,
		}).discover(root);

		expect(graph.modules).toHaveLength(2);
	});

	it("preserves cycles while rewriting both edges", async ({ expect }) => {
		writePackage("node_modules/pkg", "pkg");
		const a = write(
			"node_modules/pkg/a.cjs",
			`exports.a = require("./b.cjs");`
		);
		const b = write(
			"node_modules/pkg/b.cjs",
			`exports.b = require("./a.cjs");`
		);
		const graph = await experimental_createCommonJsGraph({
			resolve: async (specifier, importer) =>
				path.resolve(path.dirname(importer), specifier),
		}).discover(a);
		const aModule = graph.modules.find((module) => module.sourcePath === a);
		const bModule = graph.modules.find((module) => module.sourcePath === b);

		expect(graph.modules).toHaveLength(2);
		expect(aModule?.transformedSource).toContain('require("./b.cjs")');
		expect(bModule?.transformedSource).toContain('require("./a.cjs")');
	});

	it("serializes concurrent discovery of cyclic roots", async ({ expect }) => {
		writePackage("node_modules/pkg", "pkg");
		const a = write(
			"node_modules/pkg/a.cjs",
			`exports.a = require("./b.cjs");`
		);
		const b = write(
			"node_modules/pkg/b.cjs",
			`exports.b = require("./a.cjs");`
		);
		const builder = experimental_createCommonJsGraph({
			resolve: async (specifier, importer) =>
				path.resolve(path.dirname(importer), specifier),
		});

		const graphs = await Promise.all([
			builder.discover(a),
			builder.discover(b),
		]);

		expect(graphs.map((graph) => graph.modules.length)).toEqual([2, 2]);
	});

	it("rejects CommonJS requires that resolve to an ES module", async ({
		expect,
	}) => {
		writePackage("node_modules/pkg", "pkg");
		const root = write(
			"node_modules/pkg/index.cjs",
			`module.exports = require("./dependency.mjs");`
		);
		const dependency = write(
			"node_modules/pkg/dependency.mjs",
			`export default 42;`
		);

		await expect(
			experimental_createCommonJsGraph({
				resolve: async () => dependency,
			}).discover(root)
		).rejects.toThrow(/resolves to ES module/);
	});

	it("returns only safe lexer-derived named exports, including reexports", async ({
		expect,
	}) => {
		writePackage("node_modules/pkg", "pkg");
		const root = write(
			"node_modules/pkg/index.cjs",
			`module.exports = require("./exports.cjs");`
		);
		const dependency = write(
			"node_modules/pkg/exports.cjs",
			[
				`exports.good = true;`,
				`exports["alsoGood"] = true;`,
				`exports["not-valid"] = true;`,
				`exports.default = true;`,
				`exports.__esModule = true;`,
				`exports.class = true;`,
				`exports["injected = 0; export const unsafe"] = true;`,
			].join("\n")
		);
		const graph = await experimental_createCommonJsGraph({
			resolve: async () => dependency,
		}).discover(root);

		expect(graph.root.namedExports).toEqual(["alsoGood", "good"]);
	});

	it("assigns distinct stable names to duplicate package instances", async ({
		expect,
	}) => {
		writePackage("node_modules/a/node_modules/duplicate", "duplicate");
		writePackage("node_modules/b/node_modules/duplicate", "duplicate");
		const first = write(
			"node_modules/a/node_modules/duplicate/index.cjs",
			"module.exports = 1;"
		);
		const second = write(
			"node_modules/b/node_modules/duplicate/index.cjs",
			"module.exports = 2;"
		);
		const builder = experimental_createCommonJsGraph({
			resolve: async () => undefined,
		});
		const firstGraph = await builder.discover(first);
		const secondGraph = await builder.discover(second);

		expect(firstGraph.root.emittedName).not.toBe(secondGraph.root.emittedName);
		expect(firstGraph.root.emittedName).toMatch(
			/^__cloudflare_cjs__\/[a-f0-9]{10}\/duplicate\/index\.cjs$/
		);
		expect(secondGraph.root.emittedName).toMatch(
			/^__cloudflare_cjs__\/[a-f0-9]{10}\/duplicate\/index\.cjs$/
		);
	});

	it("caches shared modules across multiple roots", async ({ expect }) => {
		writePackage("node_modules/pkg", "pkg");
		const first = write(
			"node_modules/pkg/first.cjs",
			`module.exports = require("./shared.cjs");`
		);
		const second = write(
			"node_modules/pkg/second.cjs",
			`module.exports = require("./shared.cjs");`
		);
		const shared = write(
			"node_modules/pkg/shared.cjs",
			"module.exports = true;"
		);
		const resolve = vi.fn(async () => shared);
		const builder = experimental_createCommonJsGraph({ resolve });

		await builder.discover(first);
		const graph = await builder.discover(second);

		expect(resolve).toHaveBeenCalledTimes(2);
		expect(graph.modules).toHaveLength(2);
	});

	it("throws a clear diagnostic for dynamic require", async ({ expect }) => {
		writePackage("node_modules/pkg", "pkg");
		const root = write(
			"node_modules/pkg/index.cjs",
			"const name = './value.cjs';\nmodule.exports = require(name);"
		);
		const graph = experimental_createCommonJsGraph({
			resolve: async () => undefined,
		});

		await expect(graph.discover(root)).rejects.toThrow(
			/Experimental CommonJS graph cannot analyze dynamic require\(\).*index\.cjs:2:18.*one string literal/
		);
	});
});
