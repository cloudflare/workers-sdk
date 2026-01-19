#!/usr/bin/env node
/**
 * Output NODE_OPTIONS for tests based on Node version.
 *
 * Node 25+ has native localStorage enabled by default, which conflicts with MSW.
 * We need to disable it using --no-experimental-webstorage, but this flag
 * doesn't exist in Node 20-24.
 */
const major = parseInt(process.versions.node.split(".")[0], 10);

const options = [];

// Node 25+ has native webstorage enabled by default, disable it for MSW compatibility
if (major >= 25) {
	options.push("--no-experimental-webstorage");
}

// Preserve existing NODE_OPTIONS
if (process.env.NODE_OPTIONS) {
	options.push(process.env.NODE_OPTIONS);
}

process.stdout.write(options.join(" "));
