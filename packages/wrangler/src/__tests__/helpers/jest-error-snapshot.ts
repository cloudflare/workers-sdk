import type { SnapshotSerializer } from "vitest";

// Match Jest's snapshot behaviour for errors
export default {
	serialize(val: Error, config, indentation, depth, refs, printer) {
		return printer(val.message, config, indentation, depth, refs);
	},
	test(val) {
		return val && val instanceof Error;
	},
} satisfies SnapshotSerializer;
