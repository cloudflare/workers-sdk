import { UserError } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { createCommand, createNamespace } from "../../core/create-command";
import { getLocalPersistencePath } from "../../dev/get-local-persistence-path";
import { getDefaultPersistRoot } from "../../dev/miniflare";
import { logger } from "../../logger";
import type { Config } from "@cloudflare/workers-utils";

export const helloWorldNamespace = createNamespace({
	metadata: {
		description: `👋 Example local commands. DO NOT USE`,
		status: "experimental",
		owner: "Workers: Authoring and Testing",
		hidden: true,
	},
});

export async function usingLocalHelloWorldBinding<T>(
	persistTo: string | undefined,
	config: Config,
	closure: (
		namespace: Awaited<ReturnType<Miniflare["getHelloWorldBinding"]>>
	) => Promise<T>
): Promise<T> {
	const persist = getLocalPersistencePath(persistTo, config);
	const defaultPersistRoot = getDefaultPersistRoot(persist);
	const mf = new Miniflare({
		script:
			'addEventListener("fetch", (e) => e.respondWith(new Response(null, { status: 404 })))',
		defaultPersistRoot,
		helloWorld: {
			BINDING: {
				enable_timer: false,
			},
		},
	});
	const binding = await mf.getHelloWorldBinding("BINDING");
	try {
		return await closure(binding);
	} finally {
		await mf.dispose();
	}
}

export const helloWorldGetCommand = createCommand({
	metadata: {
		description: "Example local command - Get a value from the account",
		status: "experimental",
		owner: "Workers: Authoring and Testing",
		hidden: true,
	},
	positionalArgs: [],
	args: {
		remote: {
			type: "boolean",
			description: "Execute command against remote service",
			default: false,
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
	},
	async handler(args, { config }) {
		logger.log(`👋 Getting value...`);

		if (args.remote) {
			throw new UserError("Not implemented", {
				telemetryMessage: true,
			});
		}

		const value = await usingLocalHelloWorldBinding(
			args.persistTo,
			config,
			async (helloWorld) => {
				const result = await helloWorld.get();
				return result.value;
			}
		);

		if (!value) {
			logger.log("Value not found");
		} else {
			logger.log(value);
		}
	},
});

export const helloWorldSetCommand = createCommand({
	metadata: {
		description: "Example local command - Set a value to the account",
		status: "experimental",
		owner: "Workers: Authoring and Testing",
		hidden: true,
	},
	positionalArgs: ["value"],
	args: {
		value: {
			describe: "Value to set in the account",
			type: "string",
			demandOption: true,
			requiresArg: true,
		},
		remote: {
			type: "boolean",
			description: "Execute command against remote service",
			default: false,
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
	},
	async handler(args, { config }) {
		logger.log(`👋 Updating value...`);

		if (args.remote) {
			throw new UserError("Not implemented", {
				telemetryMessage: true,
			});
		}

		await usingLocalHelloWorldBinding(
			args.persistTo,
			config,
			async (helloWorld) => {
				await helloWorld.set(args.value);
			}
		);

		logger.log("Updated");
	},
});
