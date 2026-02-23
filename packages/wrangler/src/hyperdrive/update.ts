import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getConfig, patchConfig } from "./client";
import {
	getCacheOptionsFromArgs,
	getMtlsFromArgs,
	getOriginConnectionLimitFromArgs,
	getOriginFromArgs,
	upsertOptions,
} from ".";

export const hyperdriveUpdateCommand = createCommand({
	metadata: {
		description: "Update a Hyperdrive config",
		status: "stable",
		owner: "Product: Hyperdrive",
	},
	args: {
		id: {
			type: "string",
			demandOption: true,
			description: "The ID of the Hyperdrive config",
		},
		name: {
			type: "string",
			description: "Give your config a new name",
		},
		...upsertOptions(),
	},
	positionalArgs: ["id"],
	async handler(args, { config }) {
		const origin = getOriginFromArgs(true, args);

		// When mTLS args are provided but origin scheme is unknown,
		// fetch the existing config to determine the database type
		// so we can apply correct client-side validation.
		let scheme = origin?.scheme;
		const hasMtlsArgs = !!(
			args.sslmode ||
			args.caCertificateId ||
			args.mtlsCertificateId
		);
		if (!scheme && hasMtlsArgs) {
			const existing = await getConfig(config, args.id);
			scheme = existing.origin.scheme;
		}

		logger.log(`🚧 Updating '${args.id}'`);
		const updated = await patchConfig(config, args.id, {
			name: args.name,
			origin,
			caching: getCacheOptionsFromArgs(args),
			mtls: getMtlsFromArgs(args, scheme),
			origin_connection_limit: getOriginConnectionLimitFromArgs(args),
		});
		logger.log(
			`✅ Updated ${updated.id} Hyperdrive config\n`,
			JSON.stringify(updated, null, 2)
		);
	},
});
