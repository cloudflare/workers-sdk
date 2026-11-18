import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { it } from "vitest";

const packageRoot = new URL("../", import.meta.url);
const manifest = JSON.parse(
	readFileSync(new URL("package.json", packageRoot), "utf8")
) as { exports: Record<string, { import: string }> };

it.for(
	Object.entries(manifest.exports).filter(([name]) => name !== "./test-helpers")
)("loads the built %s entry in Node.js as ESM", ([, entry], { expect }) => {
	const output = execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`const api = await import(${JSON.stringify(new URL(entry.import, packageRoot).href)}); console.log(Object.keys(api).length);`,
		],
		{ encoding: "utf8", timeout: 10_000 }
	);
	expect(Number(output.trim())).toBeGreaterThan(0);
});

it("preserves function and class names in the built output", ({ expect }) => {
	const output = execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`const api = await import(${JSON.stringify(new URL("dist/index.mjs", packageRoot).href)});
const errors = await import(${JSON.stringify(new URL("dist/errors.mjs", packageRoot).href)});
console.log(JSON.stringify([api.readFileSync.name, api.parseJSON.name, api.UserError.name, errors.FatalError.name]));`,
		],
		{ encoding: "utf8", timeout: 10_000 }
	);
	expect(JSON.parse(output)).toEqual([
		"readFileSync",
		"parseJSON",
		"UserError",
		"FatalError",
	]);
});

it.for(["browser.mjs", "prometheus-metrics.mjs"])(
	"loads %s without Node.js builtins",
	(entry, { expect }) => {
		const output = execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`import { isBuiltin, registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
	if (isBuiltin(specifier)) throw new Error("Unexpected Node.js builtin: " + specifier);
	return nextResolve(specifier, context);
} });
const api = await import(${JSON.stringify(new URL(`dist/${entry}`, packageRoot).href)});
console.log(Object.keys(api).length);`,
			],
			{ encoding: "utf8", timeout: 10_000 }
		);
		expect(Number(output.trim())).toBeGreaterThan(0);
	}
);
