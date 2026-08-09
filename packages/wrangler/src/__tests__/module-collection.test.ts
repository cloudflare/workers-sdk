import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { bundleWorker, type BundleOptions } from "../deployment-bundle/bundle";
import { createModuleCollector } from "../deployment-bundle/module-collection";
import type { Entry } from "@cloudflare/workers-utils";

const moduleEntrySource = `
import fixtureDefault from "fixture";
import { fixtureNamed } from "./named.js";
const requiredFixture = require("fixture");
export default {
	fetch() {
		return Response.json({
			value: fixtureDefault(),
			named: fixtureNamed,
			required: requiredFixture.named,
		});
	}
};
`;

const serviceWorkerEntrySource = `
const fixture = require("fixture");
addEventListener("fetch", (event) => event.respondWith(new Response(fixture())));
`;

async function seedCommonJsPackage(
	entrySource: string,
	includeNodeBuiltin = true
): Promise<void> {
	await seed({
		"src/index.js": entrySource,
		"src/named.js": `
			import { named } from "fixture";
			export const fixtureNamed = named;
		`,
		"node_modules/fixture/package.json": JSON.stringify({
			name: "fixture",
			main: "index.js",
		}),
		"node_modules/fixture/index.js": `
			const path = ${includeNodeBuiltin ? 'require("path")' : '{ sep: "/" }'};
			const child = require("./child.js");
			const cycle = require("./cycle-a.js");
			function fixtureDefault() {
				return ["CJS_ROOT", path.sep, child, cycle.value].join(":");
			}
			module.exports = fixtureDefault;
			module.exports.named = "named-export";
		`,
		"node_modules/fixture/child.js": `
			const data = require("./data.json");
			module.exports = "CJS_CHILD:" + data.value;
		`,
		"node_modules/fixture/data.json": JSON.stringify({
			marker: "CJS_JSON",
			value: "json-value",
		}),
		"node_modules/fixture/cycle-a.js": `
			exports.value = "CJS_CYCLE_A";
			exports.other = require("./cycle-b.js");
		`,
		"node_modules/fixture/cycle-b.js": `
			exports.value = "CJS_CYCLE_B";
			exports.other = require("./cycle-a.js");
		`,
	});
}

async function bundleFixture({
	compatibilityFlags,
	format = "modules",
	bundle = true,
	destination = "dist",
}: {
	compatibilityFlags: string[];
	format?: Entry["format"];
	bundle?: boolean;
	destination?: string;
}) {
	const entry: Entry = {
		file: path.resolve("src/index.js"),
		projectRoot: process.cwd(),
		configPath: undefined,
		format,
		moduleRoot: path.resolve("src"),
		exports: [],
	};
	const moduleCollector = createModuleCollector({
		entry,
		findAdditionalModules: false,
	});
	const options: BundleOptions = {
		bundle,
		additionalModules: [],
		moduleCollector,
		doBindings: [],
		workflowBindings: [],
		jsxFactory: undefined,
		jsxFragment: undefined,
		entryName: undefined,
		watch: undefined,
		tsconfig: undefined,
		minify: false,
		keepNames: true,
		nodejsCompatMode: "v2",
		compatibilityDate: "2026-08-02",
		compatibilityFlags,
		define: {},
		alias: {},
		checkFetch: false,
		targetConsumer: "deploy",
		testScheduled: undefined,
		inject: undefined,
		sourcemap: false,
		plugins: undefined,
		isOutfile: undefined,
		local: false,
		projectRoot: process.cwd(),
		defineNavigatorUserAgent: false,
		external: undefined,
		metafile: undefined,
	};

	return bundleWorker(entry, path.resolve(destination), options);
}

describe("experimental CommonJS module collection", () => {
	runInTempDir();

	it("keeps bundling CommonJS dependencies when the flag is disabled", async ({
		expect,
	}) => {
		await seedCommonJsPackage(moduleEntrySource);
		const result = await bundleFixture({
			compatibilityFlags: ["nodejs_compat"],
		});
		const entrySource = await readFile(result.resolvedEntryPointPath, "utf8");

		expect(result.modules).toEqual([]);
		expect(entrySource).toContain("CJS_ROOT");
		expect(entrySource).toContain("CJS_CHILD");
		expect(entrySource).toContain("CJS_JSON");
	});

	it("externalizes a complete CommonJS graph behind an ESM interop wrapper", async ({
		expect,
	}) => {
		await seedCommonJsPackage(moduleEntrySource);
		const result = await bundleFixture({
			compatibilityFlags: ["nodejs_compat", "new_module_registry"],
		});
		const entrySource = await readFile(result.resolvedEntryPointPath, "utf8");
		const writtenModules = await Promise.all(
			result.modules.map((module) =>
				readFile(
					path.resolve(
						path.dirname(result.resolvedEntryPointPath),
						module.name
					),
					"utf8"
				)
			)
		);
		const root = result.modules.find((module) =>
			module.content.toString().includes("CJS_ROOT")
		);
		const json = result.modules.find((module) =>
			module.content.toString().includes("CJS_JSON")
		);
		const cycleA = result.modules.find((module) =>
			module.content.toString().includes("CJS_CYCLE_A")
		);
		const cycleB = result.modules.find((module) =>
			module.content.toString().includes("CJS_CYCLE_B")
		);

		expect(result.modules).toHaveLength(5);
		expect(result.modules.every((module) => module.type === "commonjs")).toBe(
			true
		);
		expect(writtenModules).toEqual(
			result.modules.map((module) => module.content.toString())
		);
		expect(new Set(result.modules.map((module) => module.name)).size).toBe(5);
		expect(root?.name).toMatch(
			/^__cloudflare_cjs__\/[a-f0-9]{10}\/fixture\/index\.js$/
		);
		expect(root?.content).toContain('require("path")');
		expect(root?.content).toContain('require("./child.js")');
		expect(json?.content).toMatch(/^module\.exports = JSON\.parse\(/);
		expect(cycleA?.content).toContain('require("./cycle-b.js")');
		expect(cycleB?.content).toContain('require("./cycle-a.js")');

		expect(entrySource).not.toContain("CJS_ROOT");
		expect(entrySource).not.toContain("CJS_CHILD");
		expect(entrySource).not.toContain("CJS_JSON");
		expect(entrySource).toContain(
			`import __commonJsModule from ${JSON.stringify(`./${root?.name}`)}`
		);
		expect(entrySource).toContain("var fixture_default = __commonJsModule");
		expect(entrySource).toContain("value: fixture_default()");
		expect(entrySource).toMatch(/var named = __commonJsModule\.named/);
		expect(entrySource).toMatch(/module\.exports = __commonJsModule\d*;/);
	});

	it.for([
		{
			label: "service-worker format",
			format: "service-worker" as const,
			bundle: true,
			entrySource: serviceWorkerEntrySource,
		},
		{
			label: "no-bundle builds",
			format: "modules" as const,
			bundle: false,
			entrySource: moduleEntrySource,
		},
	])("does not activate for $label", async (testCase, { expect }) => {
		await seedCommonJsPackage(
			testCase.entrySource,
			testCase.format === "modules"
		);
		const result = await bundleFixture({
			compatibilityFlags: ["nodejs_compat", "new_module_registry"],
			format: testCase.format,
			bundle: testCase.bundle,
		});

		expect(result.modules).toEqual([]);
	});
});
