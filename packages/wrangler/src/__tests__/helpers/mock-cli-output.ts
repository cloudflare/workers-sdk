import * as util from "node:util";
import * as streams from "@cloudflare/cli/streams";
import { normalizeString } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, vi } from "vitest";
import type { MockInstance } from "vitest";

let outSpy: MockInstance, errSpy: MockInstance;

const process = {
	get stdout() {
		return normalizeOutput(outSpy, "");
	},

	get stderr() {
		return normalizeOutput(errSpy, "");
	},
};

export function mockCLIOutput() {
	beforeEach(() => {
		outSpy = vi.spyOn(streams.stdout, "write").mockImplementation(() => true);
		errSpy = vi
			.spyOn(streams.stderr, "write")
			.mockImplementationOnce(() => true);
	});

	afterEach(() => {
		outSpy.mockRestore();
		errSpy.mockRestore();
	});

	return process;
}

function normalizeOutput(spy: MockInstance, join = "\n"): string {
	return normalizeString(captureCalls(spy, join));
}

function captureCalls(spy: MockInstance, join = "\n"): string {
	return spy.mock.calls
		.map((args: unknown[]) => util.format("%s", ...args))
		.join(join);
}
