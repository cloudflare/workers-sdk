import { fetchResult } from "./cfetch";
import { getCIMatchTag } from "./environment-variables/misc-variables";
import { FatalError } from "./errors";
import { logger } from "./logger";
import { getCloudflareAccountIdFromEnv } from "./user/auth-variables";
import type { ServiceMetadataRes } from "./init";

export async function verifyWorkerMatchesCITag(
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
			`The \`account_id\` in \`${configPath ?? "wrangler.toml"}\` must match the \`account_id\` for this account. Please update your wrangler.toml with \`account_id = "${envAccountID}"\``
		);
	}

	let tag;

	try {
		const worker = await fetchResult<ServiceMetadataRes>(
			`/accounts/${accountId}/workers/services/${workerName}`
		);
		tag = worker.default_environment.script.tag;
		logger.debug(`API returned with tag: ${tag} for worker: ${workerName}`);
	} catch (e) {
		logger.debug(e);
		// code: 10090, message: workers.api.error.service_not_found
		if ((e as { code?: number }).code === 10090) {
			throw new FatalError(
				`The name in \`${configPath ?? "wrangler.toml"}\` (${workerName}) must match the name of your Worker. Please update the name field in your wrangler.toml.`
			);
		} else {
			throw new FatalError(
				"Wrangler cannot validate that your Worker name matches what is expected by the build system. Please retry the build."
			);
		}
	}
	if (tag !== matchTag) {
		logger.debug(
			`Failed to match Worker tag. The API returned "${tag}", but the CI system expected "${matchTag}"`
		);
		throw new FatalError(
			`The name in \`${configPath ?? "wrangler.toml"}\` (${workerName}) must match the name of your Worker. Please update the name field in your wrangler.toml.`
		);
	}
}
