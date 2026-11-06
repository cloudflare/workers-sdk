import { UserError } from "@cloudflare/workers-utils";
import { fetchResult, logger } from "../../shared/context";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

/**
 * Applies `images.url_transformations` to a deployed Worker script.
 * Does nothing when the config doesn't set it, leaving any existing setting in place.
 */
export async function applyImagesUrlTransformations(
	config: ComplianceConfig & Pick<Config, "images">,
	accountId: string,
	scriptName: string,
	deployCommand: string
): Promise<void> {
	const urlTransformations = config.images?.url_transformations;
	if (urlTransformations === undefined) {
		return;
	}

	try {
		await fetchResult(
			config,
			`/accounts/${accountId}/settings/transformations/workers/${scriptName}`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					enabled: urlTransformations.enabled,
					allowed_origins: urlTransformations.allowed_origins,
				}),
			}
		);
	} catch (error) {
		throw new UserError(
			`The Worker was deployed, but its Images URL transformations setting could not be applied. Re-run the same \`${deployCommand}\` command to retry.`,
			{
				telemetryMessage: "deploy images url transformations update failed",
				cause: error,
			}
		);
	}

	logger.log(
		`Images URL transformations: ${describeUrlTransformations(urlTransformations)}`
	);
}

function describeUrlTransformations({
	enabled,
	allowed_origins,
}: NonNullable<NonNullable<Config["images"]>["url_transformations"]>) {
	if (!enabled) {
		return "disabled";
	}
	if (allowed_origins === undefined) {
		return "enabled (same zone only)";
	}
	if (allowed_origins.includes("*")) {
		return "enabled (any origin)";
	}
	return `enabled (${allowed_origins.join(", ")})`;
}
