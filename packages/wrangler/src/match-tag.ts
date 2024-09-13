import { fetchResult } from "./cfetch";
import { getCIMatchTag } from "./environment-variables/misc-variables";
import { FatalError } from "./errors";
import { logger } from "./logger";
import type { ServiceMetadataRes } from "./init";

export async function verifyWorkerMatchesCITag(
	accountId: string,
	workerName: string
) {
	const matchTag = getCIMatchTag();

	// If no tag is provided through the environment, nothing needs to be verified
	if (!matchTag) {
		return;
	}

	let tag;

	try {
		const worker = await fetchResult<ServiceMetadataRes>(
			`/accounts/${accountId}/workers/services/${workerName}`
		);
		tag = worker.default_environment.script.tag;
	} catch (e) {
		logger.debug(e);
		// code: 10090, message: workers.api.error.service_not_found
		if ((e as { code?: number }).code === 10090) {
			throw new FatalError(
				`Your Worker's name (${workerName}) does not match what is expected by the CI system`
			);
		} else {
			throw new FatalError(
				"Wrangler cannot validate that your Worker name matches what is expected by the CI system"
			);
		}
	}
	if (tag !== matchTag) {
		logger.debug(
			`Failed to match Worker tag. The API returned "${tag}", but the CI system expected "${matchTag}"`
		);
		throw new FatalError(
			`Your Worker's name (${workerName}) does not match what is expected by the CI system`
		);
	}
}
