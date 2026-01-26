import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	getOutputFileDirectoryFromEnv,
	getOutputFilePathFromEnv,
} from "@cloudflare/workers-utils";
import { ensureDirectoryExistsSync } from "./utils/filesystem";
import type { AutoConfigSummary } from "./autoconfig/types";

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
	| OutputEntryVersionDeployment
	| OutputEntryPagesDeploymentDetailed
	| OutputEntryCommandFailed
	| OutputEntryAutoConfig;

interface OutputEntrySession extends OutputEntryBase<"wrangler-session"> {
	version: 1;
	/** The semver version string taken from Wrangler's package.json. */
	wrangler_version: string;
	/** The arguments passed to Wrangler. */
	command_line_args: string[];
	/** The absolute path to a file that contains debug logs for this Wrangler instance. */
	log_file_path: string;
}

interface OutputEntryDeployment extends OutputEntryBase<"deploy"> {
	version: 1;
	/** The name of the Worker. */
	worker_name: string | null;
	/** The GUID that identifies the Worker. This never changes even if the name is changed. */
	worker_tag: string | null;
	/** A GUID that identifies this deployed version of the Worker. This version is associated with an automatically created deployment, with this version set at 100%. */
	version_id: string | null;
	/** A list of URLs that represent the HTTP triggers associated with this deployment */
	targets: string[] | undefined;
	/** set if the worker's name was overridden */
	worker_name_overridden: boolean;
	/** wrangler environment used */
	wrangler_environment: string | undefined;
}

interface OutputEntryAutoConfig extends OutputEntryBase<"autoconfig"> {
	version: 1;
	/** The command that triggered autoconfig. */
	command: "setup" | "deploy";
	/** The summary of the autoconfig process if it did run, undefined if autoconfig didn't run. */
	summary: AutoConfigSummary | undefined;
}

interface OutputEntryPagesDeployment extends OutputEntryBase<"pages-deploy"> {
	version: 1;
	/** The name of the Pages project. */
	pages_project: string | null;
	/** A GUID that identifies this Pages deployment. */
	deployment_id: string | null;
	/** The URL associated with this deployment */
	url: string | undefined;
}

interface OutputEntryPagesDeploymentDetailed
	extends OutputEntryBase<"pages-deploy-detailed"> {
	version: 1;
	/** The name of the Pages project. */
	pages_project: string | null;
	/** A GUID that identifies this Pages deployment. */
	deployment_id: string | null;
	/** The URL associated with this deployment */
	url: string | undefined;
	/** The Alias url, if it exists */
	alias: string | undefined;
	/** The environment being deployed to */
	environment: "production" | "preview";
	/** The production branch of the pages project */
	production_branch: string;
	deployment_trigger: {
		metadata: {
			/** Commit hash of the deployment trigger metadata for the pages project */
			commit_hash: string;
		};
	};
}

interface OutputEntryVersionUpload extends OutputEntryBase<"version-upload"> {
	version: 1;
	/** The name of the Worker. */
	worker_name: string | null;
	/** The GUID that identifies the Worker. This never changes even if the name is changed. */
	worker_tag: string | null;
	/** A GUID that identifies this uploaded, but not yet deployed, version of the Worker. This version will need to be "deployed" to receive traffic. */
	version_id: string | null;
	/** The preview URL associated with this version upload */
	preview_url: string | undefined;
	/** The ephemeral aliased preview URL associated with this version upload */
	preview_alias_url: string | undefined;
	/** set if the worker's name was overridden */
	worker_name_overridden: boolean;
	/** wrangler environment used */
	wrangler_environment: string | undefined;
}

interface OutputEntryVersionDeployment
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

interface OutputEntryCommandFailed extends OutputEntryBase<"command-failed"> {
	version: 1;
	/** The code in the error. */
	code: number | undefined;
	/** The message in the error. */
	message: string | undefined;
}
