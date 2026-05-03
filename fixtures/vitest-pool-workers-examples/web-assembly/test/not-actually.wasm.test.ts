// Regression test for https://github.com/cloudflare/workers-sdk/issues/8280
// A test file whose name contains ".wasm" (but whose actual extension is .ts)
// must NOT be treated as a WebAssembly module by the module rules.
import { it } from "vitest";

it("loads .wasm.test.ts files as JavaScript, not as WebAssembly", ({
	expect,
}) => {
	expect(true).toBe(true);
});
