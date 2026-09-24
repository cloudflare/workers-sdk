import {
	containersSshOptions,
	initContainersSharedContext,
	shouldUseStdio,
	sshCommand,
} from "@cloudflare/containers-shared";
import { fetchResult } from "../cfetch";
import { fillOpenAPIConfiguration } from "../cloudchamber/common";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { containersScope } from "./index";

export { verifySshInstalled } from "@cloudflare/containers-shared";

export const containersSshCommand = createCommand({
	metadata: {
		description: "SSH into a container",
		status: "stable",
		owner: "Product: Cloudchamber",
	},
	behaviour: {
		printBanner: (args) => !shouldUseStdio(args),
	},
	args: {
		ID: {
			describe: "ID of the container instance",
			type: "string",
			demandOption: true,
		},
		...containersSshOptions,
	},
	positionalArgs: ["ID"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		initContainersSharedContext({ logger, fetchResult });
		await sshCommand({
			...args,
			id: args.ID,
			command: args._.slice(2).map(String),
		});
	},
});
