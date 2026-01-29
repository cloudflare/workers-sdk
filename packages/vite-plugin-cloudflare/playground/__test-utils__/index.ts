import fs from "node:fs";
import semverGte from "semver/functions/gte";
import { version as viteVersion } from "vite";
import { onTestFinished, test } from "vitest";
import { isWindows } from "../vitest-setup";

export * from "../vitest-setup";
export * from "./responses";

export function satisfiesViteVersion(minVersion: string): boolean {
	return semverGte(viteVersion, minVersion);
}

/** Common options to use with `vi.waitFor()` */
export const WAIT_FOR_OPTIONS = {
	timeout: isWindows ? 10_000 : 5_000,
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
