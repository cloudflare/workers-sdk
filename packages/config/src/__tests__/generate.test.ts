import { describe, it } from "vitest";
import { generateTypes } from "../generate";

describe("generateTypes", () => {
	it("defaults the package import to @cloudflare/config", ({ expect }) => {
		const out = generateTypes({ configPath: "./cloudflare.config.ts" });
		expect(out).toContain(`import("@cloudflare/config").UnwrapConfig`);
		expect(out).toContain(`import("./cloudflare.config").default`);
	});

	it("accepts a custom packageName", ({ expect }) => {
		const out = generateTypes({
			configPath: "./cloudflare.config.ts",
			packageName: "@cloudflare/vite-plugin/experimental-config",
		});
		expect(out).toContain(
			`import("@cloudflare/vite-plugin/experimental-config").UnwrapConfig`
		);
		expect(out).not.toContain(`import("@cloudflare/config")`);
	});

	it("strips .ts/.js/.mts/.mjs extensions from the config import path", ({
		expect,
	}) => {
		for (const ext of ["ts", "js", "mts", "mjs"]) {
			const out = generateTypes({ configPath: `./cloudflare.config.${ext}` });
			expect(out).toContain(`import("./cloudflare.config").default`);
		}
	});

	it("calculates the inferred env in a type alias before the interface extension", ({
		expect,
	}) => {
		const out = generateTypes({ configPath: "./cloudflare.config.ts" });
		expect(out).toContain(
			`type __Env = import("@cloudflare/config").InferEnv<__WorkerConfig>;`
		);
		expect(out).toContain(`interface Env extends __Env {}`);
	});

	it("emits a global script (no top-level import/export, no declare global)", ({
		expect,
	}) => {
		const out = generateTypes({ configPath: "./cloudflare.config.ts" });
		// No top-level `import`/`export` statements — otherwise the file becomes a
		// module and appended runtime types (ambient globals) would be scoped.
		for (const line of out.split("\n")) {
			expect(line).not.toMatch(/^\s*import\s/);
			expect(line).not.toMatch(/^\s*export\s/);
		}
		expect(out).not.toContain("declare global");
	});
});
