import {
	ENVIRONMENT_TAG_PREFIX,
	SERVICE_TAG_PREFIX,
} from "@cloudflare/workers-utils";
import { logger } from "../logger";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import type { Config } from "@cloudflare/workers-utils";

export function hasDefinedEnvironments(config: Config) {
	return (
		!useServiceEnvironments(config) &&
		Boolean(config.definedEnvironments?.length)
	);
}

export function applyServiceAndEnvironmentTags(config: Config, tags: string[]) {
	const env = config.targetEnvironment;
	const serviceName = config.topLevelName;
	const shouldApplyTags = hasDefinedEnvironments(config);

	if (shouldApplyTags && !serviceName) {
		logger.warn(
			"No top-level `name` has been defined in Wrangler configuration. Add a top-level `name` to group this Worker together with its sibling environments in the Cloudflare dashboard."
		);
	}

	const serviceTag =
		shouldApplyTags && serviceName
			? `${SERVICE_TAG_PREFIX}${serviceName}`
			: null;
	const environmentTag =
		serviceTag && env ? `${ENVIRONMENT_TAG_PREFIX}${env}` : null;

	tags = tags.filter(
		(tag) =>
			!tag.startsWith(SERVICE_TAG_PREFIX) &&
			!tag.startsWith(ENVIRONMENT_TAG_PREFIX)
	);

	if (serviceTag) {
		tags.push(serviceTag);
	}

	if (environmentTag) {
		tags.push(environmentTag);
	}

	return tags;
}

export function warnOnErrorUpdatingServiceAndEnvironmentTags() {
	logger.warn(
		"Could not apply service and environment tags. This Worker will not appear grouped together with its sibling environments in the Cloudflare dashboard."
	);
}

export function tagsAreEqual(a: string[], b: string[]) {
	return a.length === b.length && a.every((el, i) => b[i] === el);
}
