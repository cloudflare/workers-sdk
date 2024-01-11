import type { GlobalSetupContext } from "vitest/node";

export default function ({ provide }: GlobalSetupContext) {
	// Runs inside Node
	provide("port", 42); /// (useful for testing upstreams/sockets)
	// console.log("global setup");
	return () => {
		// console.log("global teardown");
	};
}
