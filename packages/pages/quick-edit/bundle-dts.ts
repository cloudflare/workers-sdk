import { readFileSync, writeFileSync } from "node:fs";

function readDtsFile(reference) {
	return readFileSync(
		`../../vendor/vscode/extensions/node_modules/typescript/lib/lib.${reference}.d.ts`,
		"utf8"
	);
}

function writeDtsFile(reference, content) {
	return writeFileSync(
		`../../vendor/vscode/extensions/node_modules/typescript/lib/lib.${reference}.d.ts`,
		content
	);
}

const importRegex = /\/\/\/ <reference lib="(.+?)" \/>/g;

function replaceReferences(dts) {
	return dts.replaceAll(importRegex, (_, ref) => {
		const innerDts = readDtsFile(ref);
		console.log("Including", ref, `(${innerDts.split("\n").length} lines)`);
		return innerDts;
	});
}

function inlineDts(dts) {
	if (!importRegex.test(dts)) {
		return dts;
	}
	return inlineDts(replaceReferences(dts));
}

writeDtsFile("es2022", inlineDts(readDtsFile("es2022")));
