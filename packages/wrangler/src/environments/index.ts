import { logger } from "../logger";
import { isLegacyEnv } from "../utils/isLegacyEnv";
import { patchNonVersionedScriptSettings } from "../versions/api";
import type { Config } from "../config";

const SERVICE_TAG_PREFIX = "cf:service=";
const ENVIRONMENT_TAG_PREFIX = "cf:environment=";

export function hasDefinedEnvironments(config: Config) {
	return isLegacyEnv(config) && Boolean(config.definedEnvironments?.length);
}

export async function applyServiceAndEnvironmentTags(
	config: Config,
	accountId: string,
	scriptName: string,
	tags: string[] | null
) {
	tags ??= [];
	const env = config.targetEnvironment;
	const serviceName = config.topLevelName;

	if (!serviceName) {
		logger.warn(
			"No top-level `name` has been defined in Wrangler configuration. Add a top-level `name` to group this Worker together with its sibling environments in the Cloudflare dashboard."
		);

		if (tags.some((tag) => tag.startsWith(SERVICE_TAG_PREFIX))) {
			try {
				return await patchNonVersionedScriptSettings(
					config,
					accountId,
					scriptName,
					{
						tags: tags.filter((tag) => !tag.startsWith(SERVICE_TAG_PREFIX)),
					}
				);
			} catch {}
		}
		return;
	}

	const serviceTag = `${SERVICE_TAG_PREFIX}${serviceName}`;
	const environmentTag = env ? `${ENVIRONMENT_TAG_PREFIX}${env}` : null;

	const hasMissingServiceTag = !tags.includes(serviceTag);
	const hasMissingOrStaleEnvironmentTag = environmentTag
		? !tags.includes(environmentTag)
		: tags.some((tag) => tag.startsWith(ENVIRONMENT_TAG_PREFIX)); // check if there's a stale environment tag on a top-level worker that we should remove

	if (hasMissingServiceTag || hasMissingOrStaleEnvironmentTag) {
		const nextTags = tags
			.filter(
				(tag) =>
					!tag.startsWith(SERVICE_TAG_PREFIX) &&
					!tag.startsWith(ENVIRONMENT_TAG_PREFIX)
			)
			.concat([serviceTag]);

		if (environmentTag) {
			nextTags.push(environmentTag);
		}

		try {
			return await patchNonVersionedScriptSettings(
				config,
				accountId,
				scriptName,
				{
					tags: nextTags,
				}
			);
		} catch {
			logger.warn(
				"Could not apply service and environment tags. This Worker will not appear grouped together with its sibling environments in the Cloudflare dashboard."
			);
		}
	}
}
