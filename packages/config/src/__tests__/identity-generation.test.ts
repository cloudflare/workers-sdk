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
it("typechecks generated signing-only bindings and minted fetchers across RPC", async ({
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
      import { WorkerEntrypoint } from "cloudflare:workers";
      declare const env: Env;
      const identity = await env.IDENTITY.getIdentity("customer-x");
      const defaultIdentity = await env.IDENTITY.getIdentity();
      const selectedId: string = await identity.id;
      const pendingId: Promise<string> = identity.id;
      await identity.fetch("https://api.example.com", { method: "POST", body: "hello" });
      await defaultIdentity.fetch("https://api.example.com");
      // @ts-expect-error Select the default identity before fetching.
      env.IDENTITY.fetch("https://api.example.com");
      // @ts-expect-error Signal options are outside the RPC fetch contract.
      identity.fetch("https://api.example.com", { signal: AbortSignal.timeout(1000) });
      class Relay extends WorkerEntrypoint {
        relay(value: typeof identity): typeof identity { return value.dup(); }
      }
      declare const relay: Service<Relay>;
      const forwarded = await relay.relay(identity);
      const remoteId: Promise<string> = forwarded.id;
      const response: Promise<Response> = forwarded.fetch("https://api.example.com");
      void [defaultIdentity, selectedId, pendingId, remoteId, response];
      // @ts-expect-error Even newly selected metadata requires await.
      const unawaited: string = identity.id;
      void unawaited;
      // @ts-expect-error URL must be normalized before RPC serialization.
      identity.fetch(new URL("https://api.example.com"));
      await identity.fetch(new Request(new URL("https://api.example.com")));
      // @ts-expect-error FormData must be normalized into Request before RPC.
      void identity.fetch("https://api.example.com", { method: "POST", body: new FormData() });
      // @ts-expect-error URLSearchParams must be normalized into Request before RPC.
      void identity.fetch("https://api.example.com", { method: "POST", body: new URLSearchParams() });
      // @ts-expect-error Routing overrides are not accepted.
      void identity.fetch("https://api.example.com", { cf: { resolveOverride: "other.example" } });
      // @ts-expect-error Remote metadata requires await.
      const invalid: string = forwarded.id;
      void invalid;
      // @ts-expect-error Minted identities have no token method.
      identity.getToken();
      // @ts-expect-error Selection stays fixed.
      identity.getIdentity("other");
      // @ts-expect-error Metadata is readonly.
      identity.id = "forged";
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
