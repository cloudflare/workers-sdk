import jscodeshift from "jscodeshift";
import { describe, it } from "vitest";
import transform from "../src/codemods/vitest-pool-workers-to-vitest-plugin";

function run(source: string): string {
	return transform(
		{ path: "vitest.config.ts", source },
		// Cast needed: @types/jscodeshift's full JSCodeshift type is structurally
		// incompatible with the codemod's minimal JSCodeshift interface, but they
		// are compatible at runtime.
		{ jscodeshift: jscodeshift.withParser("ts") as never }
	);
}

describe("vitest-pool-workers-to-vitest-plugin codemod", () => {
	it("renames the bare package import", ({ expect }) => {
		const input = `import { cloudflareTest } from "@cloudflare/vitest-pool-workers";`;
		expect(run(input)).toBe(
			`import { cloudflareTest } from "@cloudflare/vitest-plugin";`
		);
	});

	it("preserves subpath imports such as /config", ({ expect }) => {
		const input = `import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";`;
		expect(run(input)).toBe(
			`import { defineWorkersProject } from "@cloudflare/vitest-plugin/config";`
		);
	});

	it("renames re-exports", ({ expect }) => {
		const input = `export { cloudflareTest } from "@cloudflare/vitest-pool-workers";`;
		expect(run(input)).toBe(
			`export { cloudflareTest } from "@cloudflare/vitest-plugin";`
		);
	});

	it("renames require() calls", ({ expect }) => {
		const input = `const { cloudflareTest } = require("@cloudflare/vitest-pool-workers");`;
		expect(run(input)).toBe(
			`const { cloudflareTest } = require("@cloudflare/vitest-plugin");`
		);
	});

	it("leaves unrelated imports untouched", ({ expect }) => {
		const input = `import { defineConfig } from "vitest/config";`;
		expect(run(input)).toBe(input);
	});
});
