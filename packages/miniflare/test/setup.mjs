import { _initialiseInstanceRegistry } from "miniflare";

const registry = _initialiseInstanceRegistry();
const bigSeparator = "=".repeat(80);
const separator = "-".repeat(80);

// `process.on("exit")` is more like `worker_thread.on(`exit`)` here. It will
// be called once AVA's finished running tests and `after` hooks. Note we can't
// use an `after` hook here, as that would run before `miniflareTest`'s
// `after` hooks to dispose their `Miniflare` instances.
process.on("exit", () => {
	if (registry.size === 0) return;

	// If there are Miniflare instances that weren't disposed, throw
	const s = registry.size === 1 ? "" : "s";
	const was = registry.size === 1 ? "was" : "were";
	const message = `Found ${registry.size} Miniflare instance${s} that ${was} not dispose()d`;
	const stacks = Array.from(registry.values()).join(`\n${separator}\n`);
	console.log(
		[bigSeparator, message, separator, stacks, bigSeparator].join("\n")
	);
	throw new Error(message);
});
