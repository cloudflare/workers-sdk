import { APIError, UserError } from "@cloudflare/workers-utils";
import { INVALID_INHERIT_BINDING_CODE } from "./error-codes";
import type { Binding, Config } from "@cloudflare/workers-utils";

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
	bindings: Record<string, Binding>,
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
				`This Worker does not exist yet, so secrets cannot be set in advance with \`wrangler secret put\`.\n` +
				`To deploy a new Worker with secrets, supply them via a secrets file:\n` +
				`  wrangler deploy --secrets-file <path-to-file>\n` +
				`where the file contains lines in the format \`SECRET_NAME=value\` (or JSON).\n` +
				`See https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers for more information.`,
			{ telemetryMessage: "required secrets missing before first deploy" }
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
		const secretPutCommand = `wrangler ${options.type === "deploy" ? "" : "versions "}secret put`;
		const secretsFileCommand = `wrangler ${options.type === "deploy" ? "deploy" : "versions upload"} --secrets-file <path-to-file>`;
		const action = options.type === "deploy" ? "deploying" : "uploading";
		throw new UserError(
			`The following required secrets have not been set: ${missingSecretNames.join(", ")}\n` +
				`Use \`${secretPutCommand} <NAME>\` to set secrets before ${action},\n` +
				`or supply them when ${action} with \`${secretsFileCommand}\`.\n` +
				`See https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers for more information.`,
			{ telemetryMessage: "required secrets missing during upload or deploy" }
		);
	}
}
