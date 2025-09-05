import {
	getCloudflareContainerRegistry,
	ImageRegistriesService,
} from "@cloudflare/containers-shared";
import { logger } from "../../logger";
import { getAccountId } from "../../user";
import { handleFailure, promiseSpinner } from "../common";
import type { Config } from "../../config";
import type { containersScope } from "../../containers";
import type {
	CommonYargsArgv,
	CommonYargsArgvSanitized,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { cloudchamberScope } from "../common";
import type { ImageRegistryPermissions } from "@cloudflare/containers-shared";

interface CatalogWithTagsResponse {
	repositories: Record<string, string[]>;
	cursor?: string;
}

interface Repository {
	name: string;
	tags: string[];
}

export const imagesCommand = (
	yargs: CommonYargsArgv,
	scope: typeof containersScope | typeof cloudchamberScope
) => {
	return yargs
		.command(
			["list", "ls"],
			"List images in the Cloudflare managed registry",
			(args) => listImagesYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers images list`,
					async (_args: CommonYargsArgvSanitized, config: Config) => {
						await handleListImagesCommand(args, config);
					},
					scope
				)(args)
		)
		.command(
			["delete <image>", "rm <image>"],
			"Remove an image from the Cloudflare managed registry",
			(args) => deleteImageYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers images delete`,
					async (_args: CommonYargsArgvSanitized, config: Config) => {
						await handleDeleteImageCommand(args, config);
					},
					scope
				)(args)
		);
};

function deleteImageYargs(yargs: CommonYargsArgv) {
	return yargs.positional("image", {
		type: "string",
		description: "Image and tag to delete, of the form IMAGE:TAG",
		demandOption: true,
	});
}

function listImagesYargs(yargs: CommonYargsArgv) {
	return yargs
		.option("filter", {
			type: "string",
			description: "Regex to filter results",
		})
		.option("json", {
			type: "boolean",
			description: "Format output as JSON",
			default: false,
		});
}

async function handleDeleteImageCommand(
	args: StrictYargsOptionsToInterface<typeof deleteImageYargs>,
	config: Config
) {
	if (!args.image.includes(":")) {
		throw new Error("Invalid image format. Expected IMAGE:TAG");
	}

	const digest = await promiseSpinner(
		getCreds().then(async (creds) => {
			const accountId = await getAccountId(config);
			const url = new URL(`https://${getCloudflareContainerRegistry()}`);
			const baseUrl = `${url.protocol}//${url.host}`;
			const [image, tag] = args.image.split(":");
			const digest_ = await deleteTag(baseUrl, accountId, image, tag, creds);

			// trigger gc
			const gcUrl = `${baseUrl}/v2/gc/layers`;
			const gcResponse = await fetch(gcUrl, {
				method: "PUT",
				headers: {
					Authorization: `Basic ${creds}`,
					"Content-Type": "application/json",
				},
			});
			if (!gcResponse.ok) {
				throw new Error(
					`Failed to delete image ${args.image}: ${gcResponse.status} ${gcResponse.statusText}`
				);
			}

			return digest_;
		}),
		{ message: `Deleting ${args.image}` }
	);

	logger.log(`Deleted ${args.image} (${digest})`);
}

async function handleListImagesCommand(
	args: StrictYargsOptionsToInterface<typeof listImagesYargs>,
	config: Config
) {
	const responses = await promiseSpinner(
		getCreds().then(async (creds) => {
			const repos = await listReposWithTags(creds);
			const processed: Repository[] = [];
			const accountId = await getAccountId(config);
			const accountIdPrefix = new RegExp(`^${accountId}/`);
			const filter = new RegExp(args.filter ?? "");
			for (const [repo, tags] of Object.entries(repos)) {
				const stripped = repo.replace(/^\/+/, "");
				if (filter.test(stripped)) {
					const name = stripped.replace(accountIdPrefix, "");
					processed.push({ name, tags });
				}
			}

			return processed;
		}),
		{ message: "Listing" }
	);

	await listImages(responses, false, args.json);
}

async function listImages(
	responses: Repository[],
	digests: boolean = false,
	json: boolean = false
) {
	if (!digests) {
		responses = responses.map((resp) => {
			return {
				name: resp.name,
				tags: resp.tags.filter((t) => !t.startsWith("sha256")),
			};
		});
	}
	// Remove any repos with no tags
	responses = responses.filter((resp) => {
		return resp.tags !== undefined && resp.tags.length != 0;
	});
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

async function listReposWithTags(
	creds: string
): Promise<Record<string, string[]>> {
	const url = new URL(`https://${getCloudflareContainerRegistry()}`);
	const catalogUrl = `${url.protocol}//${url.host}/v2/_catalog?tags=true`;

	const response = await fetch(catalogUrl, {
		method: "GET",
		headers: {
			Authorization: `Basic ${creds}`,
		},
	});
	if (!response.ok) {
		logger.log(JSON.stringify(response));
		throw new Error(
			`Failed to fetch repository catalog: ${response.status} ${response.statusText}`
		);
	}

	const data = (await response.json()) as CatalogWithTagsResponse;

	return data.repositories ?? {};
}

async function deleteTag(
	baseUrl: string,
	accountId: string,
	image: string,
	tag: string,
	creds: string
): Promise<string> {
	const manifestAcceptHeader =
		"application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json";
	const manifestUrl = `${baseUrl}/v2/${accountId}/${image}/manifests/${tag}`;
	// grab the digest for this tag
	const headResponse = await fetch(manifestUrl, {
		method: "HEAD",
		headers: {
			Authorization: `Basic ${creds}`,
			Accept: manifestAcceptHeader,
		},
	});
	if (!headResponse.ok) {
		throw new Error(
			`Failed to retrieve info for ${image}:${tag}: ${headResponse.status} ${headResponse.statusText}`
		);
	}

	const digest = headResponse.headers.get("Docker-Content-Digest");
	if (!digest) {
		throw new Error(`Digest not found for ${image}:${tag}.`);
	}

	const deleteUrl = `${baseUrl}/v2/${accountId}/${image}/manifests/${tag}`;
	const deleteResponse = await fetch(deleteUrl, {
		method: "DELETE",
		headers: {
			Authorization: `Basic ${creds}`,
			Accept: manifestAcceptHeader,
		},
	});

	if (!deleteResponse.ok) {
		throw new Error(
			`Failed to delete ${image}:${tag} (digest: ${digest}): ${deleteResponse.status} ${deleteResponse.statusText}`
		);
	}

	return digest;
}

async function getCreds(): Promise<string> {
	const credentials =
		await ImageRegistriesService.generateImageRegistryCredentials(
			getCloudflareContainerRegistry(),
			{
				expiration_minutes: 5,
				permissions: ["pull", "push"] as ImageRegistryPermissions[],
			}
		);

	return Buffer.from(`v1:${credentials.password}`).toString("base64");
}
