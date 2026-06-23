import assert from "node:assert";
import {
	configFileName,
	formatConfigSnippet,
	getTodaysCompatDate,
	UserError,
} from "@cloudflare/workers-utils";
import { verifyWorkerMatchesCITag } from "./match-tag";
import type { SharedDeployVersionsProps } from "../../shared/types";
import type { Config } from "@cloudflare/workers-utils";

type ValidationContext = "deploy" | "versions-upload";

/**
 * Shared validation that applies to both deploy and versions upload
 */
export async function validateWorkerProps(
	props: SharedDeployVersionsProps,
	config: Config,
	context: ValidationContext
): Promise<void> {
	const { name, dryRun, accountId, compatibilityDate } = props;
	const { format } = props.entry;
	if (!name) {
		throw new UserError(
			'You need to provide the name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
			{
				telemetryMessage:
					context === "deploy"
						? "deploy command missing worker name"
						: "versions upload missing worker name",
			}
		);
	}

	if (!dryRun) {
		assert(accountId, "Missing account ID");
		await verifyWorkerMatchesCITag(config, accountId, name, config.configPath);
	}

	if (!compatibilityDate) {
		const compatibilityDateStr = getTodaysCompatDate();
		throw new UserError(
			`A compatibility_date is required when uploading a Worker. Add the following to your ${configFileName(config.configPath)} file:
    \`\`\`
    ${formatConfigSnippet({ compatibility_date: compatibilityDateStr }, config.configPath, false)}
    \`\`\`
    Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`,
			{
				telemetryMessage:
					context === "deploy"
						? "missing compatibility date when deploying"
						: "versions upload missing compatibility date",
			}
		);
	}

	if (config.wasm_modules && format === "modules") {
		throw new UserError(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code",
			{ telemetryMessage: "wasm_modules with es module worker" }
		);
	}

	if (config.text_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "text_blobs with es module worker" }
		);
	}

	if (config.data_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "data_blobs with es module worker" }
		);
	}
}
