import { APIError, UserError } from "@cloudflare/workers-utils";
import { fetchResult, logger } from "../../shared/context";
import type { ComplianceConfig } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";

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
			`The Worker was deployed, but its Images URL transformations setting could not be applied:\n` +
				`${describeApplyError(error)}\n\n` +
				nextStep(classifyApplyError(error), deployCommand),
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

type ApplyErrorKind = "config" | "auth" | "transient";

/**
 * A 4xx from the API means the config was rejected, so retrying won't help,
 * except for auth failures and rate limiting.
 */
function classifyApplyError(error: unknown): ApplyErrorKind {
	const status = error instanceof APIError ? error.status : undefined;
	if (status === 401 || status === 403) {
		return "auth";
	}
	if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
		return "config";
	}
	return "transient";
}

function nextStep(kind: ApplyErrorKind, deployCommand: string): string {
	switch (kind) {
		case "config":
			return `Fix the Images URL transformations setting in your configuration and run \`${deployCommand}\` again.`;
		case "auth":
			return `Check that your API token has permission to edit Workers scripts on this account, then run \`${deployCommand}\` again.`;
		case "transient":
			return `Re-run the same \`${deployCommand}\` command to retry.`;
	}
}

function describeApplyError(error: unknown): string {
	if (error instanceof APIError) {
		const notes = error.notes.map((note) => note.text);
		const lines =
			classifyApplyError(error) === "config" && notes.length > 0
				? notes
				: [error.text, ...notes];
		return lines.join("\n");
	}
	return error instanceof Error ? error.message : String(error);
}
