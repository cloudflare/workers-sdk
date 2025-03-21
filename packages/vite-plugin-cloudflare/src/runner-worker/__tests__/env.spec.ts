import { describe, expect, test } from "vitest";
import { stripInternalEnv } from "../env";

describe("stripInternalEnv", () => {
	test("only __VITE internal fields", () => {
		const env = {
			__VITE_ROOT__: "",
			__VITE_ENTRY_PATH__: "",
			__VITE_INVOKE_MODULE__: {
				fetch: async () => new Response(),
			},
			__VITE_UNSAFE_EVAL__: {
				eval: () => () => {},
			},
		};
		const result = stripInternalEnv(env);
		expect(result).toEqual({});
	});

	test("with extra env fields", () => {
		const env = {
			__VITE_ROOT__: "",
			__VITE_ENTRY_PATH__: "",
			__VITE_INVOKE_MODULE__: {
				fetch: async () => new Response(),
			},
			__VITE_UNSAFE_EVAL__: {
				eval: () => () => {},
			},
			test: "this is a test",
			test1: "this is a test (1)",
			MY_KV: {},
		};
		const result = stripInternalEnv(env);
		expect(result).toEqual({
			MY_KV: {},
			test: "this is a test",
			test1: "this is a test (1)",
		});
	});

	test("with nested fields that share the same name as (top level) internal ones", () => {
		const env = {
			__VITE_ROOT__: "",
			__VITE_ENTRY_PATH__: "",
			__VITE_INVOKE_MODULE__: {
				fetch: async () => new Response(),
			},
			__VITE_UNSAFE_EVAL__: {
				eval: () => () => {},
			},
			myJson: {
				__VITE_ROOT__: "",
				__VITE_ENTRY_PATH__: "",
			},
		};
		const result = stripInternalEnv(env);
		expect(result).toEqual({
			myJson: {
				__VITE_ENTRY_PATH__: "",
				__VITE_ROOT__: "",
			},
		});
	});
});
