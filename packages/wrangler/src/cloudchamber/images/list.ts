import {
	getCloudflareContainerRegistry,
	ImageRegistriesService,
} from "@cloudflare/containers-shared";
import { logger } from "../../logger";
import { handleFailure, promiseSpinner } from "../common";
import type { Config } from "../../config";
import type {
	CommonYargsArgvJSON,
	CommonYargsArgvSanitizedJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../../yargs-types";
import type { ImageRegistryPermissions } from "@cloudflare/containers-shared";

interface CatalogResponse {
	repositories: string[];
}

interface TagsResponse {
	name: string;
	tags: string[];
}

export const imagesCommand = (yargs: CommonYargsArgvJSON) => {
	return yargs
		.command(
			"list",
			"perform operations on images in your Cloudflare managed registry",
			(args) => listImagesYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers images list`,
					async (_args: CommonYargsArgvSanitizedJSON, config) => {
						await handleListImagesCommand(args, config);
					}
				)(args)
		)
		.command(
			"delete [image]",
			"remove an image from your Cloudflare managed registry",
			(args) => deleteImageYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers images delete`,
					async (_args: CommonYargsArgvSanitizedJSON, config) => {
						await handleDeleteImageCommand(args, config);
					}
				)(args)
		);
};

function deleteImageYargs(yargs: CommonYargsArgvJSON) {
	return yargs.positional("image", {
		type: "string",
		description: "image to delete",
		demandOption: true,
	});
}

function listImagesYargs(yargs: CommonYargsArgvJSON) {
	return yargs.option("filter", {
		type: "string",
		description: "Regex to filter results",
	});
}

async function handleDeleteImageCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof deleteImageYargs>,
	_config: Config
) {
	try {
		if (!args.image.includes(":")) {
			throw new Error(`Must provide a tag to delete`);
		}
		return await promiseSpinner(
			getCreds().then(async (creds) => {
				const url = new URL(`https://${getCloudflareContainerRegistry()}`);
				const baseUrl = `${url.protocol}//${url.host}`;
				const [image, tag] = args.image.split(":");
				await deleteTag(baseUrl, image, tag, creds);

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
				await logger.log(`Deleted tag: ${args.image}`);
			}),
			{ message: "Deleting", json: args.json }
		);
	} catch (error) {
		logger.log(`Error when removing image: ${error}`);
	}
}

async function handleListImagesCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof listImagesYargs>,
	_config: Config
) {
	try {
		return await promiseSpinner(
			getCreds().then(async (creds) => {
				const repos = await listRepos(creds);
				const tags: TagsResponse[] = [];
				for (const repo of repos) {
					const stripped = repo.replace(/^\/+/, "");
					const regex = new RegExp(args.filter ?? "");
					if (regex.test(stripped)) {
						// get all tags for repo
						const repoTags = await listTags(stripped, creds);
						tags.push({ name: stripped, tags: repoTags });
					}
				}

				await ListTags(tags, false, args.json);
			}),
			{ message: "Listing", json: args.json }
		);
	} catch (error) {
		logger.log(`Error listing images: ${error}`);
	}
}

async function ListTags(
	responses: TagsResponse[],
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
		const rows = responses
			.map((resp) => {
				return {
					REPOSITORY: resp.name,
					TAG: resp.tags.join(" "),
				};
			})
			.flat();
		logger.table(rows);
	}
}

async function listTags(repo: string, creds: string): Promise<string[]> {
	const url = new URL(`https://${getCloudflareContainerRegistry()}`);
	const baseUrl = `${url.protocol}//${url.host}`;
	const tagsUrl = `${baseUrl}/v2/${repo}/tags/list`;

	const tagsResponse = await fetch(tagsUrl, {
		method: "GET",
		headers: {
			Authorization: `Basic ${creds}`,
		},
	});
	const tagsData = (await tagsResponse.json()) as TagsResponse;
	return tagsData.tags || [];
}

async function listRepos(creds: string): Promise<string[]> {
	const url = new URL(`https://${getCloudflareContainerRegistry()}`);

	const catalogUrl = `${url.protocol}//${url.host}/v2/_catalog`;

	const response = await fetch(catalogUrl, {
		method: "GET",
		headers: {
			Authorization: `Basic ${creds}`,
		},
	});
	if (!response.ok) {
		console.log(JSON.stringify(response));
		throw new Error(
			`Failed to fetch repository catalog: ${response.status} ${response.statusText}`
		);
	}

	const data = (await response.json()) as CatalogResponse;

	return data.repositories || [];
}

async function deleteTag(
	baseUrl: string,
	image: string,
	tag: string,
	creds: string
) {
	const manifestAcceptHeader =
		"application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json";
	const manifestUrl = `${baseUrl}/v2/${image}/manifests/${tag}`;
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
			`failed to retrieve tag info for ${tag}: ${headResponse.status} ${headResponse.statusText}`
		);
	}

	const digest = headResponse.headers.get("Docker-Content-Digest");
	if (!digest) {
		throw new Error(`Digest not found for tag "${tag}".`);
	}

	const deleteUrl = `${baseUrl}/v2/${image}/manifests/${tag}`;
	const deleteResponse = await fetch(deleteUrl, {
		method: "DELETE",
		headers: {
			Authorization: `Basic ${creds}`,
			Accept: manifestAcceptHeader,
		},
	});

	if (!deleteResponse.ok) {
		throw new Error(
			`Failed to delete tag "${tag}" (digest: ${digest}): ${deleteResponse.status} ${deleteResponse.statusText}`
		);
	}
}

async function getCreds(): Promise<string> {
	return await ImageRegistriesService.generateImageRegistryCredentials(
		getCloudflareContainerRegistry(),
		{
			expiration_minutes: 5,
			permissions: ["pull", "push"] as ImageRegistryPermissions[],
		}
	).then(async (credentials) => {
		return Buffer.from(`v1:${credentials.password}`).toString("base64");
	});
}
