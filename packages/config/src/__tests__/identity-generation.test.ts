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
it.for(["signing", "workload_authorization", "client_credentials"])(
	"typechecks generated %s identity bindings",
	{ timeout: 30_000 },
	async (mode, { expect }) => {
		const policy =
			mode === "signing"
				? {
						request_signing: {
							allowed_origins: ["https://api.example.com"],
							allowed_methods: ["GET", "POST"],
						},
					}
				: {
						client_authentication: true,
						oauth: {
							exchange: mode,
							...(mode === "client_credentials"
								? { client_id: "provider-id" }
								: {}),
							authorization_server: "https://auth.example.com",
							token_endpoint: "https://auth.example.com/token",
							resource: "https://api.example.com",
							scope: ["read"],
							allowed_origins: ["https://api.example.com"],
							allowed_methods: ["GET", "POST"],
							require_sender_constraint: true,
						},
					};
		await seed({
			[`${mode}.config.ts`]: `
      import { bindings, defineConfig } from "@cloudflare/config";
      export default defineConfig({ worker: {
        name: "signed-fetch", compatibilityDate: "2026-10-31",
        env: { IDENTITY: bindings.identity(${JSON.stringify(policy)}) },
      } });
    `,
			[`${mode}.d.ts`]: generateTypes({
				configPath: `./${mode}.config.ts`,
			}),
			[`${mode}.ts`]: `
      export {};
      declare const env: Env;
      const selected = await env.IDENTITY.getIdentity();
      const id: Promise<string> = selected.id;
      const response: Promise<Response> = selected.fetch("https://api.example.com", {
        method: "POST", body: "hello",
      });
      const metadata = await selected.getClientMetadata();
      const clientId: string = metadata.client_id;
      const assertion: string = await selected.getClientAssertion({ clientId: "provider-id", audience: "https://auth.example.com" });
      void [id, response, clientId, assertion];
      // @ts-expect-error The inferred root requires selecting an identity first.
      env.IDENTITY.fetch("https://api.example.com");
    `,
		});
		const program = ts.createProgram({
			rootNames: [
				`${mode}.config.ts`,
				`${mode}.d.ts`,
				`${mode}.ts`,
				runtimeTypes,
				nodeTypes,
			].map((file) => resolve(file)),
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
	}
);
