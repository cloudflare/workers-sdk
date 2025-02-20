import { logger } from "../../logger";
import { ImageRegistriesService } from "../client";
import { handleFailure } from "../common";
import type { Config } from "../../config";
import type {
	CommonYargsArgvJSON,
	CommonYargsArgvSanitizedJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../../yargs-types";
import type { ImageRegistryPermissions } from "../client";

// cloudflare managed registry
const domain = "registry.cloudchamber.cfdata.org";

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
			"perform operations on images in your cloudchamber registry",
			(args) => listImagesYargs(args),
			(args) =>
				handleFailure(async (_args: CommonYargsArgvSanitizedJSON, config) => {
					await handleListImagesCommand(args, config);
				})(args)
		)
		.command(
			"delete [image]",
			"remove an image from your cloudchamber registry",
			(args) => deleteImageYargs(args),
			(args) =>
				handleFailure(async (_args: CommonYargsArgvSanitizedJSON, config) => {
					await handleDeleteImageCommand(args, config);
				})(args)
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
	return yargs
		.option("filter", {
			type: "string",
			description: "Regex to filter results",
		})
		.option("include-digests", {
			type: "boolean",
			description: "Include digests in tag output",
			default: false,
		});
}

async function handleDeleteImageCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof deleteImageYargs>,
	_config: Config
) {
	const errors: string[] = [];
	try {
		return await getCreds().then(async (creds) => {
			const url = new URL(`https://${domain}`);
			const baseUrl = `${url.protocol}//${url.host}`;
			// if the user gives us a specific tag just delete that one
			if (args.image.includes(":")) {
				const [image, tag] = args.image.split(":");
				await deleteTag(baseUrl, image, tag, creds);
			} else {
				const tagsUrl = `${baseUrl}/v2/${args.image}/tags/list`;
				const tagsResponse = await fetch(tagsUrl, {
					method: "GET",
					headers: {
						Authorization: `Basic ${creds}`,
					},
				});

				if (!tagsResponse.ok) {
					throw new Error(
						`Failed to fetch tags : ${tagsResponse.status} ${tagsResponse.statusText}`
					);
				}

				const tagsData = (await tagsResponse.json()) as TagsResponse;
				const tags = tagsData.tags || [];
				if (tags.length === 0) {
					logger.log("No tags found for image.");
					return;
				}
				// For every tag retrieve the manfiest digest then delete the manifest
				for (const tag of tags) {
					try {
						await deleteTag(baseUrl, args.image, tag, creds);
					} catch (error) {
						// accumulate errors so we can report all that failed
						// instead of just the first.
						errors.push(`Error when deleting tag: ${error}`);
					}
				}
			}
			if (errors.length != 0) {
				const pprint = errors.join("\n");

				throw new Error(`Failed to delete some tags:\n ${pprint}`);
			}
			logger.log("Finalizing the delete. This may take a few seconds");

			// trigger gc
			const gcUrl = `${baseUrl}/v2/gc/manifests`;
			const gcResponse = await fetch(gcUrl, {
				method: "PUT",
				headers: {
					Authorization: `Basic ${creds}`,
					"Content-Type": "application/json",
				},
			});

			if (!gcResponse.ok) {
				logger.log(
					`Failed to delete image ${args.image}: ${gcResponse.status} ${gcResponse.statusText}`
				);
			}
		});
	} catch (error) {
		logger.log(`Error when removing image: ${error}`);
	}
}

async function handleListImagesCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof listImagesYargs>,
	_config: Config
) {
	try {
		const creds = await getCreds();
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

		await ListTags(tags, args.includeDigests, args.json);
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
	if (json) {
		logger.log(JSON.stringify(responses, null, 2));
	} else {
		const rows = responses
			.map((resp) => {
				return resp.tags.map((tag) => ({
					REPOSITORY: resp.name,
					TAG: tag,
				}));
			})
			.flat();
		logger.table(rows);
	}
}

async function listTags(repo: string, creds: string): Promise<string[]> {
	const url = new URL(`https://${domain}`);
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
	const url = new URL(`https://${domain}`);

	const catalogUrl = `${url.protocol}//${url.host}/v2/_catalog`;

	const response = await fetch(catalogUrl, {
		method: "GET",
		headers: {
			Authorization: `Basic ${creds}`,
		},
	});
	if (!response.ok) {
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

	const deleteUrl = `${baseUrl}/v2/${image}/manifests/${digest}`;
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
	logger.log(`Deleted tag "${tag}" (digest: ${digest}) for image ${image}`);
}

async function getCreds(): Promise<string> {
	return await ImageRegistriesService.generateImageRegistryCredentials(domain, {
		expiration_minutes: 5,
		permissions: ["pull", "push"] as ImageRegistryPermissions[],
	}).then(async (credentials) => {
		return Buffer.from(`v1:${credentials.password}`).toString("base64");
	});
}
