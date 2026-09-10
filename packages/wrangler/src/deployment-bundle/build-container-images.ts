import {
	buildContainerImages,
	isDockerfileContainerConfig,
	verifyDockerInstalled,
} from "@cloudflare/containers-shared";
import { getDockerPath } from "@cloudflare/workers-utils";
import type { BuiltContainerDeployment } from "@cloudflare/containers-shared";
import type { DeployProps } from "@cloudflare/deploy-helpers";

export async function buildDeployContainerImages(
	props: DeployProps
): Promise<BuiltContainerDeployment[]> {
	if (
		props.containersRollout === "none" ||
		props.normalisedContainerConfig.length === 0
	) {
		return [];
	}

	const containersWithDockerfile = props.normalisedContainerConfig.filter(
		isDockerfileContainerConfig
	);
	if (containersWithDockerfile.length === 0) {
		return [];
	}

	const dockerPath = getDockerPath();
	await verifyDockerInstalled({
		dockerPath,
		operation: `deploying${props.dryRun ? " (even in dry-run mode)" : ""}`,
		imageNoun:
			containersWithDockerfile.length !== 1
				? "the configured images"
				: "the configured image",
		hint: "If you cannot run Docker locally, you can still deploy your Worker by passing --containers-rollout=none. This will not deploy or update your Container.",
	});

	return buildContainerImages(containersWithDockerfile, dockerPath, false);
}
