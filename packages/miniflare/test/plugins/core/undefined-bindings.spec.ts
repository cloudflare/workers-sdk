import test from "ava";
import { CoreOptionsSchema } from "../../../src/plugins/core";

test("CoreOptionsSchema should filter undefined values from bindings", (t) => {
	const input = {
		script: "export default { fetch() { return new Response('ok'); } }",
		bindings: {
			DEFINED_BINDING: "value",
			UNDEFINED_BINDING: undefined,
			ANOTHER_DEFINED: 42,
		},
	};

	const result = CoreOptionsSchema.parse(input);

	t.deepEqual(result.bindings, {
		DEFINED_BINDING: "value",
		ANOTHER_DEFINED: 42,
	});
});

test("CoreOptionsSchema should filter undefined values from serviceBindings", (t) => {
	const input = {
		script: "export default { fetch() { return new Response('ok'); } }",
		serviceBindings: {
			DEFINED_SERVICE: "some-service",
			UNDEFINED_SERVICE: undefined,
		},
	};

	const result = CoreOptionsSchema.parse(input);

	t.deepEqual(result.serviceBindings, {
		DEFINED_SERVICE: "some-service",
	});
});

test("CoreOptionsSchema should handle all undefined bindings gracefully", (t) => {
	const input = {
		script: "export default { fetch() { return new Response('ok'); } }",
		bindings: {
			UNDEFINED_1: undefined,
			UNDEFINED_2: undefined,
		},
		serviceBindings: {
			UNDEFINED_SERVICE: undefined,
		},
	};

	const result = CoreOptionsSchema.parse(input);

	t.is(result.bindings, undefined);
	t.is(result.serviceBindings, undefined);
});

test("CoreOptionsSchema should handle mixed defined and undefined bindings", (t) => {
	const input = {
		script: "export default { fetch() { return new Response('ok'); } }",
		bindings: {
			DEFINED_BINDING: "test-value",
			UNDEFINED_BINDING_1: undefined,
			UNDEFINED_BINDING_2: undefined,
		},
		wasmBindings: {
			DEFINED_WASM: new Uint8Array([0x00, 0x61, 0x73, 0x6d]),
			UNDEFINED_WASM: undefined,
		},
	};

	const result = CoreOptionsSchema.parse(input);

	t.deepEqual(result.bindings, {
		DEFINED_BINDING: "test-value",
	});
	t.deepEqual(result.wasmBindings, {
		DEFINED_WASM: new Uint8Array([0x00, 0x61, 0x73, 0x6d]),
	});
});
