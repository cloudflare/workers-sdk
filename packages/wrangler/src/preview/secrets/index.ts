import {
	getBranchName,
	NO_ACTIVE_PREVIEW_URLS_MESSAGE,
	patchPreviewDeployment,
} from "@cloudflare/deploy-helpers";
import { APIError, UserError } from "@cloudflare/workers-utils";
import { createNamespace } from "../../core/create-command";
import type { Binding } from "@cloudflare/deploy-helpers";
import type { Config } from "@cloudflare/workers-utils";

export const previewSecretNamespace = createNamespace({
	metadata: {
		description: "Manage secrets for Worker Previews",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
});

export function resolvePreviewName(args: { name?: string }): string {
	const previewName = args.name ?? getBranchName();
	if (!previewName) {
		throw new UserError(
			"Could not determine Preview name. No git branch detected. " +
				"Please provide a Preview name using --name <preview-name>.",
			{ telemetryMessage: "preview secret command missing preview name" }
		);
	}
	return previewName;
}

// A `null` value maps to `null` in the merge-patch body, which deletes the
// secret from the deployment — matching `wrangler secret bulk` semantics.
export function toSecretBindingsPatch(
	secrets: Record<string, string | null>
): Record<string, Binding | null> {
	return Object.fromEntries(
		Object.entries(secrets).map(([name, text]) => [
			name,
			text === null ? null : { type: "secret_text", text },
		])
	);
}

// The PATCH (put/delete/bulk) and GET (list) paths report different
// no-deployment error codes; not-found is shared.
export const NO_PREVIEW_DEPLOYMENT_PATCH_ERR_CODE = 10032;
export const NO_PREVIEW_DEPLOYMENT_GET_ERR_CODE = 10222;
export const PREVIEW_NOT_FOUND_ERR_CODE = 10025;
export { NO_ACTIVE_PREVIEW_URLS_MESSAGE };

export function noPreviewDeploymentPatchMessage(previewName: string) {
	return `There are currently no deployments for the Preview "${previewName}". Please create a Preview deployment before modifying a secret.`;
}

export function noPreviewDeploymentListMessage(previewName: string) {
	return `There are currently no deployments for the Preview "${previewName}". Please create a Preview deployment.`;
}

export function previewNotFoundMessage(previewName: string) {
	return `The Preview "${previewName}" was not found. Please check the Preview name, or create it with \`wrangler preview\`.`;
}

export async function patchPreviewDeploymentSecrets(
	config: Config,
	accountId: string,
	workerName: string,
	previewName: string,
	env: Record<string, Binding | null>,
	annotation: { message: string; tag?: string },
	telemetryMessages: { noDeployment: string; previewNotFound: string }
) {
	try {
		return await patchPreviewDeployment(
			config,
			accountId,
			workerName,
			previewName,
			env,
			{
				"workers/message": annotation.message,
				"workers/tag": annotation.tag,
			}
		);
	} catch (e) {
		if (e instanceof APIError) {
			if (e.code === NO_PREVIEW_DEPLOYMENT_PATCH_ERR_CODE) {
				throw new UserError(noPreviewDeploymentPatchMessage(previewName), {
					telemetryMessage: telemetryMessages.noDeployment,
				});
			}
			if (e.code === PREVIEW_NOT_FOUND_ERR_CODE) {
				throw new UserError(previewNotFoundMessage(previewName), {
					telemetryMessage: telemetryMessages.previewNotFound,
				});
			}
		}
		throw e;
	}
}
