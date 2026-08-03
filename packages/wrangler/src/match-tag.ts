import { verifyWorkerMatchesCITag as verifyWorkerMatchesCITagBase } from "@cloudflare/deploy-helpers";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

export async function verifyWorkerMatchesCITag(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	configPath?: string
) {
	return verifyWorkerMatchesCITagBase(
		complianceConfig,
		accountId,
		workerName,
		configPath
	);
}
