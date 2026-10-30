import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { getConfigCache, saveToConfigCache } from "../config-cache";
import { logger } from "../logger";

type DelegatedDeploymentTarget = {
	projectPath: string;
	accountId: string;
	workerName: string;
};

type SuccessfulDelegatedDeployment = { versionId: string };

function getOwnershipCacheFileName(target: DelegatedDeploymentTarget): string {
	// A cache folder can be shared by workspace projects or WRANGLER_CACHE_DIR.
	// Include all three identities so one project cannot adopt another's Worker.
	const key = createHash("sha256")
		.update(
			JSON.stringify([
				resolve(target.projectPath),
				target.accountId,
				target.workerName,
			])
		)
		.digest("hex");
	return `pages-to-workers-deployments/${key}.json`;
}

/** Whether this project has previously deployed this Worker in this account. */
export function hasSuccessfulDelegatedDeployment(
	target: DelegatedDeploymentTarget
): boolean {
	const { versionId } = getConfigCache<SuccessfulDelegatedDeployment>(
		getOwnershipCacheFileName(target)
	);
	return typeof versionId === "string" && versionId.length > 0;
}

/**
 * Records a confirmed successful deployment so config-free projects can
 * redeploy. Cache failures must not turn an already successful deploy into an
 * error; without a record, subsequent deploys retain collision protection.
 */
export function recordSuccessfulDelegatedDeployment(
	target: DelegatedDeploymentTarget,
	versionId: string
): void {
	try {
		saveToConfigCache<SuccessfulDelegatedDeployment>(
			getOwnershipCacheFileName(target),
			{ versionId }
		);
	} catch (error) {
		logger.warn(
			"Could not save the deployment's local ownership record. A repeat delegated deploy may need a Wrangler configuration naming this Worker."
		);
		logger.debug(error);
	}
}
