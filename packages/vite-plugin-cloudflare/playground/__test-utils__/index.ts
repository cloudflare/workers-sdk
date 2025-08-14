import fs from "node:fs";
import { onTestFinished, test } from "vitest";

export * from "../vitest-setup";
export * from "./responses";

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
