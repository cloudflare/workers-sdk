import { cancel } from "@cloudflare/cli-shared-helpers";
import {
	deleteContainerImage,
	listContainerImages,
	parseContainerImageTag,
	promiseSpinner,
} from "@cloudflare/containers-shared";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { fillOpenAPIConfiguration } from "../cloudchamber/common";
import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { getOrSelectAccountId } from "../user";
import { containersScope } from ".";
import type { ContainerImageRepository } from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";

// --- Namespace definition ---

export const containersImagesNamespace = createNamespace({
	metadata: {
		description: "Manage images in the Cloudflare managed registry",
		status: "stable",
		owner: "Product: Cloudchamber",
	},
});

// --- Command definitions ---

export const containersImagesListCommand = createCommand({
	metadata: {
		description: "List images in the Cloudflare managed registry",
		status: "stable",
		owner: "Product: Cloudchamber",
	},
	behaviour: {
		printBanner: (args) => !args.json && !isNonInteractiveOrCI(),
	},
	args: {
		filter: {
			type: "string",
			description: "Regex to filter results",
		},
		json: {
			type: "boolean",
			description: "Format output as JSON",
			default: false,
		},
	},
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await handleListImagesCommand(args, config);
	},
});

export const containersImagesDeleteCommand = createCommand({
	metadata: {
		description: "Remove an image from the Cloudflare managed registry",
		status: "stable",
		owner: "Product: Cloudchamber",
	},
	behaviour: {
		printBanner: () => !isNonInteractiveOrCI(),
	},
	args: {
		image: {
			type: "string",
			description: "Image and tag to delete, of the form IMAGE:TAG",
			demandOption: true,
		},
		"skip-confirmation": {
			type: "boolean",
			description: "Skip confirmation prompt for deleting an image",
			alias: "y",
			default: false,
		},
	},
	positionalArgs: ["image"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await handleDeleteImageCommand(args, config);
	},
});

// --- Handler functions ---

async function handleDeleteImageCommand(
	args: { image: string; skipConfirmation: boolean },
	config: Config
) {
	parseContainerImageTag(args.image);

	if (!args.skipConfirmation) {
		const yes = await confirm(
			`Are you sure you want to delete ${args.image}? This action cannot be undone.`
		);
		if (!yes) {
			cancel("The operation has been cancelled");
			return;
		}
	}

	const accountId = await getOrSelectAccountId(config);
	const { digest, warning } = await promiseSpinner(
		deleteContainerImage({
			accountId,
			complianceConfig: config,
			image: args.image,
		}),
		{ message: `Deleting ${args.image}` }
	);

	logger.log(`Deleted ${args.image} (${digest})`);
	if (warning) {
		logger.warn(warning);
	}
}

async function handleListImagesCommand(
	args: { filter?: string; json: boolean },
	config: Config
) {
	const accountId = await getOrSelectAccountId(config);
	const responses = await promiseSpinner(
		listContainerImages({
			accountId,
			complianceConfig: config,
			filter: args.filter,
		}),
		{ message: "Listing" }
	);
	await listImages(responses, args.json);
}

async function listImages(
	responses: ContainerImageRepository[],
	json: boolean = false
) {
	if (json) {
		logger.log(JSON.stringify(responses, null, 2));
	} else {
		const rows = responses.flatMap((r) => r.tags.map((t) => [r.name, t]));
		const headers = ["REPOSITORY", "TAG"];
		const widths = new Array(headers.length).fill(0);

		// Find the maximum length of each column (except for the last)
		for (let i = 0; i < widths.length - 1; i++) {
			widths[i] = rows
				.map((r) => r[i].length)
				.reduce((a, b) => Math.max(a, b), headers[i].length);
		}

		logger.log(headers.map((h, i) => h.padEnd(widths[i], " ")).join("  "));
		for (const row of rows) {
			logger.log(row.map((v, i) => v.padEnd(widths[i], " ")).join("  "));
		}
	}
}
