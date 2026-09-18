import { ImageRegistriesService, ImageRegistryPermissions } from "./client";
import { getCloudflareContainerRegistry } from "./knobs";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

export interface DeleteContainerImageResult {
	digest: string;
	/** Present when deletion succeeded but the garbage-collection request failed. */
	warning?: string;
}

export interface ContainerImageRepository {
	name: string;
	tags: string[];
}

interface RegistryOptions {
	accountId: string;
	complianceConfig?: ComplianceConfig;
}

/**
 * List visible image tags in the managed registry. Configure the shared OpenAPI
 * client with account credentials and API base URL before calling.
 */
export async function listContainerImages({
	accountId,
	complianceConfig,
	filter,
}: RegistryOptions & { filter?: string }): Promise<ContainerImageRepository[]> {
	const pattern = new RegExp(filter ?? "");
	const creds = await getCreds(
		[ImageRegistryPermissions.PULL],
		complianceConfig
	);
	const repositories = await listReposWithTags(creds, complianceConfig);
	const prefix = `${accountId}/`;
	return Object.entries(repositories).flatMap(([repo, tags]) => {
		const stripped = repo.replace(/^\/+/, "");
		if (!pattern.test(stripped)) {
			return [];
		}
		const visibleTags = tags.filter((tag) => !tag.startsWith("sha256"));
		if (visibleTags.length === 0) {
			return [];
		}
		return [
			{
				name: stripped.startsWith(prefix)
					? stripped.slice(prefix.length)
					: stripped,
				tags: visibleTags,
			},
		];
	});
}

/** Validate an account-relative IMAGE:TAG before prompting or issuing requests. */
export function parseContainerImageTag(image: string): {
	repository: string;
	tag: string;
} {
	const parts = image.split(":");
	const [repository, tag] = parts;
	if (
		parts.length !== 2 ||
		!repository ||
		!tag ||
		/[\s?#@%\\]/.test(image) ||
		!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag) ||
		repository.split("/").some((part) => !part || part === "." || part === "..")
	) {
		throw new Error("Invalid image format. Expected IMAGE:TAG");
	}
	return { repository, tag };
}

/**
 * Delete a managed registry image tag and request layer garbage collection.
 * The caller must obtain confirmation and configure the shared OpenAPI client
 * with account credentials and API base URL before calling.
 * @returns The deleted digest and an optional warning if requesting GC failed.
 */
export async function deleteContainerImage({
	accountId,
	complianceConfig,
	image,
}: RegistryOptions & { image: string }): Promise<DeleteContainerImageResult> {
	const { repository, tag } = parseContainerImageTag(image);
	const creds = await getCreds(
		[ImageRegistryPermissions.PULL, ImageRegistryPermissions.PUSH],
		complianceConfig
	);
	const url = new URL(
		`https://${getCloudflareContainerRegistry(complianceConfig)}`
	);
	const baseUrl = `${url.protocol}//${url.host}`;
	const digest = await deleteTag(baseUrl, accountId, repository, tag, creds);
	try {
		const response = await fetch(`${baseUrl}/v2/gc/layers`, {
			method: "PUT",
			headers: {
				Authorization: `Basic ${creds}`,
				"Content-Type": "application/json",
			},
		});
		if (!response.ok) {
			throw new Error(`${response.status} ${response.statusText}`);
		}
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			digest,
			warning: `Image ${image} was deleted, but the garbage-collection request failed: ${detail}`,
		};
	}
	return { digest };
}

interface CatalogWithTagsResponse {
	repositories?: Record<string, string[]>;
}

async function listReposWithTags(
	creds: string,
	complianceConfig?: ComplianceConfig
): Promise<Record<string, string[]>> {
	const url = new URL(
		`https://${getCloudflareContainerRegistry(complianceConfig)}`
	);
	const catalogUrl = `${url.protocol}//${url.host}/v2/_catalog?tags=true`;

	const repositories = new Map<string, Set<string>>();
	const seenCursors = new Set<string>();
	let nextUrl = catalogUrl;
	while (true) {
		const response = await fetch(nextUrl, {
			method: "GET",
			headers: { Authorization: `Basic ${creds}` },
		});
		if (!response.ok) {
			throw new Error(
				`Failed to fetch repository catalog: ${response.status} ${response.statusText}`
			);
		}
		const data = (await response.json()) as CatalogWithTagsResponse;
		for (const [repository, tags] of Object.entries(data.repositories ?? {})) {
			const merged = repositories.get(repository) ?? new Set<string>();
			for (const tag of tags) {
				merged.add(tag);
			}
			repositories.set(repository, merged);
		}
		const cursor = nextCatalogCursor(response.headers.get("Link"), nextUrl);
		if (cursor === undefined) {
			break;
		}
		if (seenCursors.has(cursor)) {
			throw new Error("Registry catalog pagination repeated a cursor.");
		}
		seenCursors.add(cursor);
		// Only reuse the cursor, keeping credentials on the configured registry.
		const next = new URL(catalogUrl);
		next.searchParams.set("last", cursor);
		nextUrl = next.href;
	}
	return Object.fromEntries(
		[...repositories].map(([repository, tags]) => [repository, [...tags]])
	);
}

// Accept standard Link headers and the managed registry's bare-URL variant.
function nextCatalogCursor(
	header: string | null,
	baseUrl: string
): string | undefined {
	if (!header) {
		return undefined;
	}
	const links = header.matchAll(
		/(?:^|,)\s*(?:<([^>]+)>|([^;,\s]+))((?:;[^,]*)?)/g
	);
	for (const [, bracketed, bare, parameters] of links) {
		const relation = /;\s*rel\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(
			parameters ?? ""
		);
		if (!(relation?.[1] ?? relation?.[2] ?? "").split(/\s+/).includes("next")) {
			continue;
		}
		const target = bracketed ?? bare;
		if (!target) {
			throw new Error("Registry catalog next-page link is missing a URL.");
		}
		const cursor = new URL(target, baseUrl).searchParams.get("last");
		if (!cursor) {
			throw new Error("Registry catalog next-page link is missing a cursor.");
		}
		return cursor;
	}
	return undefined;
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

async function getCreds(
	permissions: ImageRegistryPermissions[],
	complianceConfig?: ComplianceConfig
): Promise<string> {
	const credentials =
		await ImageRegistriesService.generateImageRegistryCredentials(
			getCloudflareContainerRegistry(complianceConfig),
			{
				expiration_minutes: 5,
				permissions,
			}
		);

	return Buffer.from(`v1:${credentials.password}`).toString("base64");
}
