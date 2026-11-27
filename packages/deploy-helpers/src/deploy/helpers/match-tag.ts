import {
	APIError,
	FatalError,
	getCIMatchTag,
	getEnvironmentVariableFactory,
} from "@cloudflare/workers-utils";
import {
	configFileName,
	formatConfigSnippet,
} from "@cloudflare/workers-utils/config";
import { fetchResult, logger } from "../../shared/context";
import { isWorkerNotFoundError } from "./worker-not-found-error";
import type {
	ComplianceConfig,
	ServiceMetadataRes,
} from "@cloudflare/workers-utils";

const getCloudflareAccountIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCOUNT_ID",
	deprecatedName: "CF_ACCOUNT_ID",
});

export async function verifyWorkerMatchesCITag(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	configPath: string | undefined
) {
	const matchTag = getCIMatchTag();

	logger.debug(
		`Starting verifyWorkerMatchesCITag() with tag: ${matchTag}, name: ${workerName}`
	);

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

	const worker = await fetchResult<ServiceMetadataRes>(
		complianceConfig,
		`/accounts/${accountId}/workers/services/${workerName}`
	).catch((e: unknown) => {
		logger.debug(e);
		if (isWorkerNotFoundError(e)) {
			return undefined;
		}
		if (e instanceof APIError) {
			throw new FatalError(
				"An error occurred while trying to validate that the Worker name matches what is expected by the build system.\n" +
					e.message +
					"\n" +
					e.notes.map((note) => note.text).join("\n"),
				{ telemetryMessage: "ci match tag validation api error" }
			);
		}
		throw new FatalError(
			"The Worker name could not be validated against what is expected by the build system. Please retry the build. " +
				"If the problem persists, please contact support.",
			{ telemetryMessage: "ci match tag validation failed" }
		);
	});
	const tag = worker?.default_environment.script?.tag;
	if (!tag) {
		throw new FatalError(
			`The Worker "${workerName}" was not found in your account. Check that the name in your ${configFileName(configPath)} file is correct and that the Worker exists in this account.`,
			{ telemetryMessage: "ci match tag worker not found" }
		);
	}
	logger.debug(`API returned with tag: ${tag} for worker: ${workerName}`);
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
