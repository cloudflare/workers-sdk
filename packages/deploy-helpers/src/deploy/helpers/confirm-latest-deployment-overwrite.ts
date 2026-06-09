import * as cli from "@cloudflare/cli-shared-helpers";
import { brandColor, gray, white } from "@cloudflare/cli-shared-helpers/colors";
import { inputPrompt, leftT } from "@cloudflare/cli-shared-helpers/interactive";
import { isNonInteractiveOrCI } from "../../shared/context";
import { fetchDeploymentVersions, fetchLatestDeployment } from "./versions-api";
import { isWorkerNotFoundError } from "./worker-not-found-error";
import type {
	ApiDeployment,
	ApiVersion,
	Percentage,
	VersionCache,
	VersionId,
} from "./versions-types";
import type { Config } from "@cloudflare/workers-utils";

const BLANK_INPUT = "-";

export async function confirmLatestDeploymentOverwrite(
	config: Config,
	accountId: string,
	scriptName: string
) {
	try {
		const latest = await fetchLatestDeployment(config, accountId, scriptName);
		if (latest && latest.versions.length >= 2) {
			const versionCache: VersionCache = new Map();

			cli.warn(
				`Your last deployment has multiple versions. To progress that deployment use "wrangler versions deploy" instead.`,
				{ shape: cli.shapes.corners.tl, newlineBefore: false }
			);
			cli.newline();
			await printDeployment(
				config,
				accountId,
				scriptName,
				latest,
				"last",
				versionCache
			);

			return inputPrompt<boolean>({
				type: "confirm",
				question: `"wrangler deploy" will upload a new version and deploy it globally immediately.\nAre you sure you want to continue?`,
				label: "",
				defaultValue: isNonInteractiveOrCI(),
				acceptDefault: isNonInteractiveOrCI(),
			});
		}
	} catch (e) {
		if (!isWorkerNotFoundError(e)) {
			throw e;
		}
	}
	return true;
}

async function printDeployment(
	config: Config,
	accountId: string,
	workerName: string,
	deployment: ApiDeployment | undefined,
	adjective: "current" | "last",
	versionCache: VersionCache
) {
	const [versions, traffic] = await fetchDeploymentVersions(
		config,
		accountId,
		workerName,
		deployment,
		versionCache
	);
	cli.logRaw(
		`${leftT} Your ${adjective} deployment has ${versions.length} version(s):`
	);
	printVersions(versions, traffic);
}

export function printVersions(
	versions: ApiVersion[],
	traffic: Map<VersionId, Percentage>
) {
	cli.newline();
	cli.log(formatVersions(versions, traffic));
	cli.newline();
}

function formatVersions(
	versions: ApiVersion[],
	traffic: Map<VersionId, Percentage>
) {
	return versions
		.map((version) => {
			const trafficString = brandColor(`(${traffic.get(version.id)}%)`);
			const versionIdString = white(version.id);
			return gray(`${trafficString} ${versionIdString}
      Created:  ${version.metadata.created_on}
          Tag:  ${version.annotations?.["workers/tag"] ?? BLANK_INPUT}
      Message:  ${version.annotations?.["workers/message"] ?? BLANK_INPUT}`);
		})
		.join("\n\n");
}
