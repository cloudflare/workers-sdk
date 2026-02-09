import fs from "node:fs";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getTunnelToken, resolveTunnelId } from "./client";
import { decodeTunnelTokenToCredentialsFile } from "./credentials";

export const tunnelTokenCommand = createCommand({
	metadata: {
		description:
			"Fetch the credentials token for an existing tunnel (by name or UUID) that allows to run it",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		tunnel: {
			type: "string",
			demandOption: true,
			description: "The tunnel name or UUID",
		},
		credFile: {
			type: "string",
			alias: ["cred-file", "credentials-file"],
			description:
				"Write tunnel credentials JSON to this path instead of printing the token",
		},
	},
	positionalArgs: ["tunnel"],
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);
		const tunnelId = await resolveTunnelId(sdk, accountId, args.tunnel);
		const token = await getTunnelToken(sdk, accountId, tunnelId);

		if (!token) {
			throw new UserError(
				`Failed to get tunnel token for "${args.tunnel}".\n\n` +
					`The API returned an empty token. Please ensure the tunnel exists and is properly configured.`
			);
		}

		metrics.sendMetricsEvent("tunnel token", {
			sendMetrics: config.send_metrics,
		});

		if (args.credFile) {
			if (fs.existsSync(args.credFile)) {
				throw new UserError(`${args.credFile} already exists`);
			}
			const credentials = decodeTunnelTokenToCredentialsFile(token);
			fs.writeFileSync(args.credFile, JSON.stringify(credentials), { mode: 0o400 });
			return;
		}

		// Output just the token so it can be piped/copied.
		logger.log(token);
	},
});
