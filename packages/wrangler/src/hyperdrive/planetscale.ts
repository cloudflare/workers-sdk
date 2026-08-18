import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import { createDatabaseSignature } from "./client";

export const hyperdrivePlanetscaleNamespace = createNamespace({
	metadata: {
		description: "Provision Cloudflare-billed PlanetScale databases",
		status: "experimental",
		owner: "Product: Hyperdrive",
	},
});

export const hyperdrivePlanetscaleSignatureCommand = createCommand({
	metadata: {
		description:
			"Generate a signed authorization for creating a Cloudflare-billed PlanetScale database",
		status: "experimental",
		owner: "Product: Hyperdrive",
	},
	// Print only JSON, so the output can be piped into `pscale database create`.
	behaviour: { printBanner: false },
	args: {},
	async handler(_args, { config }) {
		const signature = await createDatabaseSignature(config, "planetScale");
		logger.log(JSON.stringify(signature, null, 2));
	},
});
