import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	getOutputFileDirectoryFromEnv,
	getOutputFilePathFromEnv,
} from "./environment-variables/misc-variables";
import { ensureDirectoryExistsSync } from "./utils/filesystem";

/**
 * Write an entry to the output file.
 *
 * Control whether (and where) to write this file by setting either
 * `WRANGLER_OUTPUT_FILE_DIRECTORY` or `WRANGLER_OUTPUT_FILE_PATH`.
 */
export function writeOutput(entry: OutputEntry) {
	if (outputFilePath === undefined) {
		outputFilePath = getOutputFilePath();
	}
	if (outputFilePath !== null) {
		ensureDirectoryExistsSync(outputFilePath);
		const entryJSON = JSON.stringify({
			...entry,
			timestamp: new Date().toISOString(),
		});
		appendFileSync(outputFilePath, entryJSON + "\n");
	}
}

// Only used internally for cleaning up tests
export function clearOutputFilePath() {
	outputFilePath = undefined;
}

let outputFilePath: string | null | undefined = undefined;
function getOutputFilePath() {
	const outputFilePathFromEnv = getOutputFilePathFromEnv();
	if (outputFilePathFromEnv) {
		return outputFilePathFromEnv;
	}

	const outputFileDirectoryFromEnv = getOutputFileDirectoryFromEnv();
	if (outputFileDirectoryFromEnv) {
		const date = new Date()
			.toISOString()
			.replaceAll(":", "-")
			.replace(".", "_")
			.replace("T", "_")
			.replace("Z", "");

		return resolve(
			outputFileDirectoryFromEnv,
			`wrangler-output-${date}-${randomBytes(3).toString("hex")}.json`
		);
	}

	return null;
}

interface OutputEntryBase<T extends string> {
	version: number;
	type: T;
}

/**
 * All the different types of entry you can output.
 */
export type OutputEntry =
	| OutputEntrySession
	| OutputEntryDeployment
	| OutputEntryVersionUpload
	| OutputEntryVersionDeployment;

export interface OutputEntrySession
	extends OutputEntryBase<"wrangler-session"> {
	wrangler_version: string;
	command_line_args: string[];
}

export interface OutputEntryDeployment extends OutputEntryBase<"deployment"> {
	worker_id: string | undefined;
	deployment_id: string;
}

export interface OutputEntryVersionUpload
	extends OutputEntryBase<"version-upload"> {
	worker_id: string;
	version_id: string;
}

export interface OutputEntryVersionDeployment
	extends OutputEntryBase<"version-deploy"> {
	worker_id: string;
	version_traffic: Map<string, number>;
}
