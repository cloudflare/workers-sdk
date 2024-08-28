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
	| OutputEntryPagesDeployment
	| OutputEntryVersionUpload
	| OutputEntryVersionDeployment;

export type StampedOutputEntry = { timestamp: string } & OutputEntry;

export interface OutputEntrySession
	extends OutputEntryBase<"wrangler-session"> {
	version: 1;
	/** The semver version string taken from Wrangler's package.json. */
	wrangler_version: string;
	/** The arguments passed to Wrangler. */
	command_line_args: string[];
	/** The absolute path to a file that contains debug logs for this Wrangler instance. */
	log_file_path: string;
}

export interface OutputEntryDeployment extends OutputEntryBase<"deploy"> {
	version: 1;
	/** The name of the Worker. */
	worker_name: string | null;
	/** The GUID that identifies the Worker. This never changes even if the name is changed. */
	worker_tag: string | null;
	/** A GUID that identifies this deployed version of the Worker. This version is associated with an automatically created deployment, with this version set at 100%. */
	version_id: string | null;
	/** A list of URLs that represent the HTTP triggers associated with this deployment */
	targets: string[] | undefined;
}

export interface OutputEntryPagesDeployment
	extends OutputEntryBase<"pages-deploy"> {
	version: 1;
	/** The name of the Pages project. */
	pages_project: string | null;
	/** A GUID that identifies this Pages deployment. */
	deployment_id: string | null;
	/** The URL associated with this deployment */
	url: string | undefined;
}

export interface OutputEntryVersionUpload
	extends OutputEntryBase<"version-upload"> {
	version: 1;
	/** The name of the Worker. */
	worker_name: string | null;
	/** The GUID that identifies the Worker. This never changes even if the name is changed. */
	worker_tag: string | null;
	/** A GUID that identifies this uploaded, but not yet deployed, version of the Worker. This version will need to be "deployed" to receive traffic. */
	version_id: string | null;
}

export interface OutputEntryVersionDeployment
	extends OutputEntryBase<"version-deploy"> {
	version: 1;
	/** The name of the Worker. */
	worker_name: string | null;
	/** The GUID that identifies the Worker. This never changes even if the name is changed. */
	worker_tag: string | null;
	/** The ID of the gradual rollout deployment. */
	deployment_id: string;
	/** The percentage of traffic that goes to each version. */
	version_traffic: Map<string, number>;
}
