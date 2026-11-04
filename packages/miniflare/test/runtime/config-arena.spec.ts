import { Message } from "capnp-es";
import { test } from "vitest";
import { serializeConfig } from "../../src/runtime/config";
import { Config as CapnpConfig } from "../../src/runtime/config/generated/workerd";

// `SingleSegmentArena` in capnp-es grows by allocating a brand-new
// `ArrayBuffer` of `old + 4096` bytes and copying the whole arena into it on
// every allocation. Once the arena holds megabytes of module text, each small
// allocation (each binding, each nested struct) therefore copies the entire
// multi-megabyte arena, and peak memory scales with module bytes x allocation
// count (see workers-sdk#15271).
//
// This test counts the allocations of large `ArrayBuffer`s made while
// serializing a config whose arena grows to several megabytes: each such
// allocation here is a full copy of the multi-megabyte arena, so peak memory
// scales with arena bytes x number of growth steps. A well-behaved
// implementation (pre-sized arena, or geometric growth) performs only a
// handful.
test("serializing a large config does not copy the whole arena per allocation", ({
	expect,
}) => {
	const WORKERS = 8;
	const MODULE_BYTES = 512 * 1024;
	const BINDINGS = 100;
	// Large enough that each binding's text value forces its own arena
	// regrowth once the previous 4096-byte growth step has been consumed.
	const BINDING_BYTES = 1024;
	const LARGE_ALLOCATION = 64 * 1024;

	const filler = "/*" + "x".repeat(MODULE_BYTES) + "*/\n";
	const bindingValue = "v".repeat(BINDING_BYTES);
	const services = [];
	for (let w = 0; w < WORKERS; w++) {
		const bindings = [];
		for (let b = 0; b < BINDINGS; b++) {
			bindings.push({ name: `VAR_${b}`, text: bindingValue });
		}
		services.push({
			name: `worker-${w}`,
			worker: {
				compatibilityDate: "2026-01-01",
				bindings,
				modules: [{ name: `/virtual/worker-${w}.js`, esModule: filler }],
			},
		});
	}

	const RealArrayBuffer = globalThis.ArrayBuffer;
	let largeAllocations = 0;
	class CountingArrayBuffer extends RealArrayBuffer {
		constructor(...args: [] | [byteLength: number]) {
			super(args[0] ?? 0);
			if ((args[0] ?? 0) >= LARGE_ALLOCATION) largeAllocations++;
		}
	}
	globalThis.ArrayBuffer =
		CountingArrayBuffer as unknown as typeof RealArrayBuffer;
	let buffer: Uint8Array;
	try {
		buffer = serializeConfig({ services });
	} finally {
		globalThis.ArrayBuffer = RealArrayBuffer;
	}

	// The serialized config must still be valid.
	const config = new Message(buffer, false).getRoot(CapnpConfig);
	expect(config.services.length).toBe(WORKERS);
	expect(config.services.get(0).worker.modules.get(0).name).toBe(
		"/virtual/worker-0.js"
	);
	expect(
		config.services.get(0).worker.modules.get(0).esModule.toString().length
	).toBe(filler.length);

	// ~4 MiB of module text and 800 bindings: growing the arena by 4096
	// bytes at a time makes over two hundred >= 64 KiB full-arena copies.
	expect(largeAllocations).toBeLessThanOrEqual(24);
});
