import fs from "node:fs";
import { onTestFinished, test } from "vitest";

export * from "../vitest-setup";
export * from "./responses";

export function failsIf(condition: boolean) {
	return condition ? test.fails : test;
}

export function mockFileChange(
	filePath: string,
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
