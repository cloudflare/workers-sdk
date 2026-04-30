import {
	APIError,
	configFileName,
	FatalError,
	formatConfigSnippet,
	getCIMatchTag,
} from "@cloudflare/workers-utils";
import { fetchResult } from "./cfetch";
import { logger } from "./logger";
import { getCloudflareAccountIdFromEnv } from "./user/auth-variables";
import { isWorkerNotFoundError } from "./utils/worker-not-found-error";
import type {
	ComplianceConfig,
	ServiceMetadataRes,
} from "@cloudflare/workers-utils";

export async function verifyWorkerMatchesCITag(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	configPath?: string
) {
	const matchTag = getCIMatchTag();

	logger.debug(
		`Starting verifyWorkerMatchesCITag() with tag: ${matchTag}, name: ${workerName}`
	);

	// If no tag is provided through the environment, nothing needs to be verified
	if (!matchTag) {
		logger.debug(
			"No WRANGLER_CI_MATCH_TAG variable provided, aborting verifyWorkerMatchesCITag()"
		);
		return;
	}

	const envAccountID = getCloudflareAccountIdFromEnv();

	if (accountId !== envAccountID) {
		throw new FatalError(
			`The \`account_id\` in your ${configFileName(configPath)} file must match the \`account_id\` for this account. Please update your ${configFileName(configPath)} file with \`${formatConfigSnippet({ account_id: envAccountID }, configPath, false)}\``,
			{ telemetryMessage: "ci match tag account mismatch" }
		);
	}

	let tag;

	try {
		const worker = await fetchResult<ServiceMetadataRes>(
			complianceConfig,
			`/accounts/${accountId}/workers/services/${workerName}`
		);
		tag = worker.default_environment.script.tag;
		logger.debug(`API returned with tag: ${tag} for worker: ${workerName}`);
	} catch (e) {
		logger.debug(e);
		if (isWorkerNotFoundError(e)) {
			throw new FatalError(
				`The name in your ${configFileName(configPath)} file (${workerName}) must match the name of your Worker. Please update the name field in your ${configFileName(configPath)} file.`,
				{ telemetryMessage: "ci match tag worker not found" }
			);
		} else if (e instanceof APIError) {
			throw new FatalError(
				"An error occurred while trying to validate that the Worker name matches what is expected by the build system.\n" +
					e.message +
					"\n" +
					e.notes.map((note) => note.text).join("\n"),
				{ telemetryMessage: "ci match tag validation api error" }
			);
		} else {
			throw new FatalError(
				"Wrangler cannot validate that your Worker name matches what is expected by the build system. Please retry the build. " +
					"If the problem persists, please contact support.",
				{ telemetryMessage: "ci match tag validation failed" }
			);
		}
	}
	if (tag !== matchTag) {
		logger.debug(
			`Failed to match Worker tag. The API returned "${tag}", but the CI system expected "${matchTag}"`
		);
		throw new FatalError(
			`The name in your ${configFileName(configPath)} file (${workerName}) must match the name of your Worker. Please update the name field in your ${configFileName(configPath)} file.`,
			{ telemetryMessage: "ci match tag tag mismatch" }
		);
	}
}
