import { describe, expectTypeOf, it } from "vitest";
import { bindings } from "../bindings";
import { defineWorker } from "../worker-definition";
import type { InferEnv, UnwrapConfig } from "../inference";

const config = defineWorker({
	name: "my-worker",
	compatibilityDate: "2026-06-01",
	env: {
		REQUIRED_SECRET: bindings.secret(),
		EXPLICITLY_REQUIRED_SECRET: bindings.secret({ optional: false }),
		OPTIONAL_SECRET: bindings.secret({ optional: true }),
	},
});

type Env = InferEnv<UnwrapConfig<typeof config>>;

describe("secret bindings", () => {
	it("infers `bindings.secret()` as a required string", ({ expect }) => {
		expectTypeOf<Env["REQUIRED_SECRET"]>().toEqualTypeOf<string>();
		expect(bindings.secret()).toEqual({ type: "secret" });
	});

	it("infers `bindings.secret({ optional: false })` as a required string", ({
		expect,
	}) => {
		expectTypeOf<Env["EXPLICITLY_REQUIRED_SECRET"]>().toEqualTypeOf<string>();
		expect(bindings.secret({ optional: false })).toEqual({
			type: "secret",
			optional: false,
		});
	});

	it("infers `bindings.secret({ optional: true })` as `string | undefined`", ({
		expect,
	}) => {
		expectTypeOf<Env["OPTIONAL_SECRET"]>().toEqualTypeOf<string | undefined>();
		expect(bindings.secret({ optional: true })).toEqual({
			type: "secret",
			optional: true,
		});
	});

	it("keeps every secret key present on the inferred env", ({ expect }) => {
		// Optionality is expressed as `| undefined`, not as an optional key, so
		// `keyof Env` is unaffected.
		expectTypeOf<keyof Env>().toEqualTypeOf<
			"REQUIRED_SECRET" | "EXPLICITLY_REQUIRED_SECRET" | "OPTIONAL_SECRET"
		>();
		expect(Object.keys(bindings.secret())).toEqual(["type"]);
	});
});
