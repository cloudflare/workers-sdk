import { logger } from "../../shared/context";

export function deployWfpUserWorker(
	dispatchNamespace: string,
	versionId: string | null
) {
	// Will go under the "Uploaded" text
	logger.log("  Dispatch Namespace:", dispatchNamespace);
	logger.log("Current Version ID:", versionId);
}
