import { describe, test } from "vitest";
import { stripInternalEnv } from "../env";
import type { __VITE_RUNNER_OBJECT__ } from "../module-runner";

const internalEnv = {
	__VITE_RUNNER_OBJECT__: {
		get: () => ({}) as __VITE_RUNNER_OBJECT__,
	},
	__VITE_INVOKE_MODULE__: {
		fetch: async () => new Response(),
	},
	__VITE_UNSAFE_EVAL__: {
		eval: () => () => {},
	},
};

describe("stripInternalEnv", () => {
	test("strips internal properties", ({ expect }) => {
		const result = stripInternalEnv(internalEnv);
		expect(result).toEqual({});
	});

	test("strips internal properties when extra properties are included", ({
		expect,
	}) => {
		const env = {
			...internalEnv,
			test: "this is a test",
			MY_KV: {},
		};
		const result = stripInternalEnv(env);
		expect(result).toEqual({
			test: "this is a test",
			MY_KV: {},
		});
	});
});
