import { bindings, defineConfig } from "@cloudflare/config";
import { describe, expectTypeOf, it } from "vitest";
import { createTestHarness } from "../index";
import type { AnyEnv } from "../test-harness";
import type { CloudflareWorkersModule } from "@cloudflare/workers-types";

interface RpcWorker extends CloudflareWorkersModule.WorkerEntrypoint {
	getMessage(name: string): string;
}
type RpcWorkerModule = {
	default: new (
		...args: ConstructorParameters<
			typeof CloudflareWorkersModule.WorkerEntrypoint
		>
	) => RpcWorker;
};

const config = defineConfig({
	worker: {
		name: "typed-worker",
		// What `import * as entrypoint from "./index.ts" with { type: "cf-worker" }` gives
		entrypoint: {} as RpcWorkerModule,
		compatibilityDate: "2026-05-20",
		env: {
			GREETING: bindings.text("Hello"),
			SETTINGS: bindings.json({ retries: 3 }),
		},
	},
});

describe("getWorker() types", () => {
	it("infers the Env and module from a Worker's config module", () => {
		const server = createTestHarness();

		const worker = server.getWorker<{ default: typeof config }>();
		type Env = Awaited<ReturnType<typeof worker.getEnv>>;
		expectTypeOf<Env["GREETING"]>().toEqualTypeOf<"Hello">();
		expectTypeOf<Env["SETTINGS"]>().toEqualTypeOf<{ retries: number }>();
		type Export = Awaited<ReturnType<typeof worker.getExport>>;
		expectTypeOf<Export>().toHaveProperty("getMessage");
	});

	it("keeps Wrangler's Env and untyped handles", () => {
		const server = createTestHarness();

		const typed = server.getWorker<{ GREETING: string }>();
		expectTypeOf<Awaited<ReturnType<typeof typed.getEnv>>>().toEqualTypeOf<{
			GREETING: string;
		}>();
		const untyped = server.getWorker();
		expectTypeOf<
			Awaited<ReturnType<typeof untyped.getEnv>>
		>().toEqualTypeOf<AnyEnv>();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Wrangler's harness takes `any` too
		const anyWorker = server.getWorker<any>();
		expectTypeOf<Awaited<ReturnType<typeof anyWorker.getEnv>>>().toBeAny();
	});
});
