import { UserError } from "@cloudflare/workers-utils";

/**
 * Validate a secret variable name before it is sent to the API.
 *
 * The dashboard accepts names with accidental leading/trailing whitespace,
 * which produces a binding that is silently inaccessible as `env.<name>`
 * (issue #15019). Reject them here so the mistake is caught before deploy.
 */
export function validateSecretName(name: string): void {
	if (name !== name.trim()) {
		throw new UserError(
			`The secret name "${name}" must not start or end with whitespace, ` +
				`otherwise the binding would be inaccessible as env.${name.trim()}. ` +
				`Please recreate the secret without surrounding whitespace.`,
			{ telemetryMessage: "secret invalid secret name whitespace" }
		);
	}
}
