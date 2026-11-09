import { bindings, defineConfig } from "@cloudflare/config";
import { describe, expectTypeOf, it } from "vitest";
import { createTestHarness } from "../index";
import type { AnyEnv } from "../index";

const config = defineConfig({
	worker: {
		name: "typed-worker",
		compatibilityDate: "2026-05-20",
		env: {
			GREETING: bindings.text("Hello"),
			SETTINGS: bindings.json({ retries: 3 }),
		},
	},
});

describe("getWorker() types", () => {
	it("infers the Env from a Worker's config module", () => {
		const server = createTestHarness();

		const worker = server.getWorker<{ default: typeof config }>();
		type Env = Awaited<ReturnType<typeof worker.getEnv>>;
		expectTypeOf<Env["GREETING"]>().toEqualTypeOf<"Hello">();
		expectTypeOf<Env["SETTINGS"]>().toEqualTypeOf<{ retries: number }>();
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
	});
});
