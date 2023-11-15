import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

const teardownCallbacks: (() => void | Promise<void>)[] = [];
export function teardown(callback: () => void | Promise<void>) {
	// `unshift()` so teardown callbacks executed in reverse
	teardownCallbacks.unshift(callback);
}

afterEach(async () => {
	const errors: unknown[] = [];
	for (const callback of teardownCallbacks.splice(0)) {
		try {
			await callback();
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0)
		throw new AggregateError(
			errors,
			["Unable to teardown:", ...errors.map(String)].join("\n")
		);
});

export function useTmp() {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-vitest-"));
	teardown(() => fs.rmSync(tmp, { recursive: true, force: true }));
	return tmp;
}
