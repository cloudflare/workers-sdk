import { APIError, UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { createNamespace } from "./client";

export const agentMemoryNamespaceCreateCommand = createCommand({
	metadata: {
		description: "Create a new Agent Memory namespace",
		status: "open beta",
		owner: "Product: Agent Memory",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		namespace: {
			type: "string",
			demandOption: true,
			description:
				"The name for the new namespace (max 32 characters, alphanumeric with embedded hyphens)",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["namespace"],
	async handler({ namespace, json }, { config }) {
		let result;
		try {
			result = await createNamespace(config, namespace);
		} catch (e) {
			// Surface server-side validation / conflict errors (e.g. invalid name,
			// duplicate namespace) as UserErrors so they are not reported to Sentry
			// and the user sees the underlying message from the API.
			if (
				e instanceof APIError &&
				e.status !== undefined &&
				[400, 409, 422].includes(e.status)
			) {
				const details = e.notes
					.map((n) => n.text)
					.filter((t) => t.length > 0)
					.join("\n");
				throw new UserError(
					`Failed to create Agent Memory namespace "${namespace}".${details ? `\n${details}` : ""}`,
					{
						telemetryMessage:
							"Agent Memory namespace create failed with client error",
					}
				);
			}
			throw e;
		}

		if (json) {
			logger.json(result);
			return;
		}

		logger.log(`✅ Created Agent Memory namespace "${result.name}"`);
		logger.table([
			{
				namespace_id: result.id,
				name: result.name,
				account_id: result.account_id,
				created_at: result.created_at,
			},
		]);
	},
});
