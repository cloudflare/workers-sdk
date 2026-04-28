import { APIError, UserError } from "@cloudflare/workers-utils";
import { INVALID_INHERIT_BINDING_CODE } from "../utils/error-codes";
import type { StartDevWorkerInput } from "../api/startDevWorker/types";
import type { Config } from "@cloudflare/workers-utils";

type SecretsValidationOptions =
	| { type: "deploy"; workerExists: boolean }
	| { type: "upload" };

/**
 * When `secrets.required` is defined in config, validate the secrets exist on the Worker.
 * For deploy, if the Worker doesn't exist yet, fail immediately.
 * For upload, always add inherit bindings — the API handles the case where
 * the Worker doesn't exist (versions upload cannot create new Workers).
 * Secrets already provided (e.g. via --secrets-file) are excluded since
 * they are part of the upload and don't need to be inherited.
 */
export function addRequiredSecretsInheritBindings(
	config: Config,
	bindings: NonNullable<StartDevWorkerInput["bindings"]>,
	options: SecretsValidationOptions
): void {
	if (!config.secrets?.required?.length) {
		return;
	}

	const inheritedSecrets = config.secrets.required.filter(
		(secretName) => !(secretName in bindings)
	);

	if (inheritedSecrets.length === 0) {
		return;
	}

	if (options.type === "deploy" && !options.workerExists) {
		throw new UserError(
			`The following required secrets have not been set: ${inheritedSecrets.join(", ")}\n` +
				`Use \`wrangler secret put <NAME>\` to set secrets before deploying.\n` +
				`See https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers for more information.`
		);
	}

	for (const secretName of inheritedSecrets) {
		bindings[secretName] = { type: "inherit" };
	}
}

/**
 * Reformats API errors for strict inherit binding validation failures into
 * user-friendly messages listing the missing required secrets.
 * The API returns all missing inherit bindings at once, each as a separate
 * error in response.errors, which maps to individual err.notes entries.
 */
export function handleMissingSecretsError(
	err: unknown,
	config: Config,
	options: SecretsValidationOptions
): void {
	if (!(err instanceof APIError) || err.code !== INVALID_INHERIT_BINDING_CODE) {
		return;
	}

	const missingSecretNames = err.notes
		.map((note) => note.text.match(/^inherit binding '(.+?)' is invalid/))
		.filter((match): match is RegExpMatchArray => match !== null)
		.map((match) => match[1])
		.filter((secretName) => config.secrets?.required?.includes(secretName));

	if (missingSecretNames.length > 0) {
		err.preventReport();
		throw new UserError(
			`The following required secrets have not been set: ${missingSecretNames.join(", ")}\n` +
				`Use \`wrangler ${options.type === "deploy" ? "secret put" : "versions secret put"} <NAME>\` to set secrets before ${options.type === "deploy" ? "deploying" : "uploading"}.\n` +
				`See https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers for more information.`
		);
	}
}
