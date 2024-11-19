import { getVersionSource } from "../list";
import type { ApiDeployment } from "../types";

export function getDeploymentSource(deployment: ApiDeployment) {
	return getVersionSource({
		metadata: { source: deployment.source },
		annotations: deployment.annotations,
	});
}
