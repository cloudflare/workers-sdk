import { UserError } from "@cloudflare/workers-utils";
import { performApiFetch } from "../cfetch";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Parse a header string in "Key: Value" format into [key, value].
 * Throws if the format is invalid.
 */
function parseHeader(header: string): [string, string] {
	const colonIndex = header.indexOf(":");
	if (colonIndex === -1) {
		throw new UserError(
			`Invalid header format: "${header}". Expected "Key: Value".`
		);
	}
	const key = header.slice(0, colonIndex).trim();
	const value = header.slice(colonIndex + 1).trim();
	if (!key) {
		throw new UserError(
			`Invalid header format: "${header}". Header name cannot be empty.`
		);
	}
	return [key, value];
}

/**
 * Replace :account_id placeholder in the endpoint path with the resolved account ID.
 * Only resolves the account ID if the placeholder is present.
 */
async function resolveEndpoint(
	endpoint: string,
	config: Config,
	accountIdFlag: string | undefined
): Promise<string> {
	if (!endpoint.includes(":account_id")) {
		return endpoint;
	}

	// If --account-id flag was provided, use it directly
	if (accountIdFlag) {
		return endpoint.replaceAll(":account_id", accountIdFlag);
	}

	// Otherwise, resolve account ID through the normal flow
	const accountId = await requireAuth(config);
	return endpoint.replaceAll(":account_id", accountId);
}

export const apiCommand = createCommand({
	metadata: {
		description: "Make authenticated HTTP requests to the Cloudflare API",
		status: "open beta",
		owner: "Workers: Authoring and Testing",
	},
	behaviour: {
		printBanner: false,
		printConfigWarnings: false,
		provideConfig: true,
	},
	args: {
		endpoint: {
			describe: "The API endpoint to request (e.g. /zones)",
			type: "string",
			demandOption: true,
		},
		header: {
			describe: "Add an HTTP request header in Key: Value format",
			type: "string",
			array: true,
			alias: "H",
		},
		"account-id": {
			describe: "Account ID to use for :account_id in the endpoint path",
			type: "string",
		},
	},
	positionalArgs: ["endpoint"],
	async handler(args, { config }) {
		const endpoint = args.endpoint;

		// Validate endpoint starts with /
		if (!endpoint.startsWith("/")) {
			throw new UserError(
				`Endpoint must start with "/", but got "${endpoint}".`
			);
		}

		// Parse custom headers
		const headers: Record<string, string> = {};
		if (args.header) {
			for (const h of args.header) {
				const [key, value] = parseHeader(h);
				headers[key] = value;
			}
		}

		// Resolve :account_id placeholder if present
		const resolvedEndpoint = await resolveEndpoint(
			endpoint,
			config,
			args.accountId
		);

		// Make the authenticated GET request
		const response = await performApiFetch(config, resolvedEndpoint, {
			method: "GET",
			headers,
		});

		// Read the response body
		const responseText = await response.text();

		// Try to pretty-print JSON, fall back to raw text
		try {
			const json = JSON.parse(responseText);

			// On 403, add a helpful hint
			if (response.status === 403) {
				logger.log(JSON.stringify(json, null, 2));
				logger.warn(
					"You may need to re-authenticate with additional scopes. Run `wrangler login` to get a new token."
				);
				return;
			}

			logger.log(JSON.stringify(json, null, 2));
		} catch {
			// Not JSON — print raw
			if (response.status === 403) {
				logger.log(responseText);
				logger.warn(
					"You may need to re-authenticate with additional scopes. Run `wrangler login` to get a new token."
				);
				return;
			}

			logger.log(responseText);
		}
	},
});
