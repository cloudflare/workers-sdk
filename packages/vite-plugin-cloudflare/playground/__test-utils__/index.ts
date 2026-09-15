import fs from "node:fs";
import { onTestFinished, test } from "vitest";
import { isWindows } from "../vitest-setup";

export * from "../vitest-setup";
export * from "./responses";
export { satisfiesMinimumViteVersion } from "./vite-version";

/**
 * Common options to use with `vi.waitFor()`.
 *
 * These must stay comfortably below the test timeout in `vitest.config.e2e.ts`.
 * If `vi.waitFor()` is given as much time as the test itself, the test always
 * dies of a bare "Test timed out" before `waitFor` gets to surface the
 * assertion that was actually failing.
 */
export const WAIT_FOR_OPTIONS = {
	timeout: isWindows ? 30_000 : 15_000,
	interval: 500,
};

export function failsIf(condition: boolean) {
	return condition ? test.fails : test;
}

/**
 * Makes a change to a file and restores it after the test is finished.
 */
export function mockFileChange(
	/** The path to the file to change */
	filePath: string,
	/** A function that modifies the original content of the file */
	mutateFn: (originalContent: string) => string
) {
	const originalContent = fs.readFileSync(filePath, "utf-8");
	onTestFinished(() => {
		console.log("Restoring file change for", filePath);
		fs.writeFileSync(filePath, originalContent);
	});
	console.log("Mocking file change for", filePath);
	fs.writeFileSync(filePath, mutateFn(originalContent));
}
