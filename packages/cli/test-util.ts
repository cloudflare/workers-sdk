import { afterEach, beforeEach } from "vitest";

import { stripAnsi } from "./index";
import { stderr, stdout } from "./streams";

// Copied from packages/wrangler/src/__tests__/helpers/collect-cli-output.ts
export function collectCLIOutput() {
	const std = { out: "", err: "" };
	const onStdOutData = (chunk: Buffer) => (std.out += chunk.toString());
	const onStdErrData = (chunk: Buffer) => (std.err += chunk.toString());

	beforeEach(() => {
		stdout.on("data", onStdOutData);
		stderr.on("data", onStdErrData);
	});

	afterEach(() => {
		stdout.off("data", onStdOutData);
		stderr.off("data", onStdErrData);
		std.out = "";
		std.err = "";
	});

	return std;
}

// Based on the implementation on packages/wrangler/e2e/helpers/normalize.ts
export function normalizeOutput(output: string) {
	const functions = [stripAnsi, normalizeSlashes, removeZeroWidthSpaces];

	for (const f of functions) {
		output = f(output);
	}

	return output;
}

// Copied from packages/wrangler/e2e/helpers/normalize.ts
export function normalizeSlashes(str: string): string {
	return str.replace(/\\/g, "/");
}

// Copied from packages/wrangler/e2e/helpers/normalize.ts
function removeZeroWidthSpaces(output: string) {
	return output.replaceAll(/\u200a|\u200b/g, " ");
}
