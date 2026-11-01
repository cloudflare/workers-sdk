import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import ts from "typescript";
import { it } from "vitest";
import { generateTypes } from "../generate";

const require = createRequire(import.meta.url);
const publicConfig = resolve(import.meta.dirname, "../public.ts");
const runtimeTypes =
	require.resolve("@cloudflare/workers-types/experimental/index.d.ts");
const nodeTypes = require.resolve("@types/node/index.d.ts");
runInTempDir();

// Cold Windows runners need longer than Vitest's default for the full compiler.
it("typechecks generated signing-only identity bindings", async ({
	expect,
}) => {
	await seed({
		"cloudflare.config.ts": `
      import { bindings, defineConfig } from "@cloudflare/config";
      export default defineConfig({ worker: {
        name: "signed-fetch", compatibilityDate: "2026-10-31",
        env: { IDENTITY: bindings.identity({ request_signing: {
          allowed_origins: ["https://api.example.com"], allowed_methods: ["GET", "POST"],
        } }) },
      } });
    `,
		"worker-configuration.d.ts": generateTypes({
			configPath: "./cloudflare.config.ts",
		}),
		"worker.ts": `
      export {};
      declare const env: Env;
      const selected = await env.IDENTITY.getIdentity("customer-x");
      const id: Promise<string> = selected.id;
      const response: Promise<Response> = selected.fetch("https://api.example.com", {
        method: "POST", body: "hello",
      });
      void [id, response];
      // @ts-expect-error The inferred root requires selecting an identity first.
      env.IDENTITY.fetch("https://api.example.com");
    `,
	});
	const program = ts.createProgram({
		rootNames: [
			"cloudflare.config.ts",
			"worker-configuration.d.ts",
			"worker.ts",
			runtimeTypes,
			nodeTypes,
		],
		options: {
			strict: true,
			noEmit: true,
			skipLibCheck: true,
			target: ts.ScriptTarget.ES2024,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			lib: ["lib.es2024.d.ts", "lib.esnext.disposable.d.ts"],
			types: [],
			paths: { "@cloudflare/config": [publicConfig] },
		},
	});
	const diagnostics = ts
		.getPreEmitDiagnostics(program)
		.map(
			(diagnostic) =>
				`${diagnostic.file?.fileName ?? "config"}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
		);
	expect(diagnostics).toEqual([]);
}, 30_000);
