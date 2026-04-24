import { fetchListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type {
	ArtifactsCreateRepoRequest,
	ArtifactsCreateRepoResult,
	ArtifactsIssueTokenRequest,
	ArtifactsIssueTokenResult,
	ArtifactsNamespace,
	ArtifactsRepo,
} from "./types";
import type { Config } from "@cloudflare/workers-utils";

function getArtifactsNamespacesPath(accountId: string): string {
	return `/accounts/${accountId}/artifacts/namespaces`;
}

function getArtifactsNamespacePath(
	accountId: string,
	namespace: string
): string {
	return `${getArtifactsNamespacesPath(accountId)}/${encodeURIComponent(namespace)}`;
}

function getArtifactsReposPath(accountId: string, namespace: string): string {
	return `${getArtifactsNamespacePath(accountId, namespace)}/repos`;
}

function getArtifactsRepoPath(
	accountId: string,
	namespace: string,
	name: string
): string {
	return `${getArtifactsReposPath(accountId, namespace)}/${encodeURIComponent(name)}`;
}

export async function createNamespace(
	config: Config,
	name: string
): Promise<ArtifactsNamespace> {
	const accountId = await requireAuth(config);
	return await fetchResult(config, getArtifactsNamespacesPath(accountId), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name }),
	});
}

export async function listNamespaces(
	config: Config
): Promise<ArtifactsNamespace[]> {
	const accountId = await requireAuth(config);
	return await fetchListResult(config, getArtifactsNamespacesPath(accountId), {
		method: "GET",
	});
}

export async function getNamespace(
	config: Config,
	name: string
): Promise<ArtifactsNamespace> {
	const accountId = await requireAuth(config);
	return await fetchResult(config, getArtifactsNamespacePath(accountId, name), {
		method: "GET",
	});
}

export async function deleteNamespace(
	config: Config,
	name: string
): Promise<void> {
	const accountId = await requireAuth(config);
	await fetchResult(config, getArtifactsNamespacePath(accountId, name), {
		method: "DELETE",
	});
}

export async function createRepo(
	config: Config,
	namespace: string,
	body: ArtifactsCreateRepoRequest
): Promise<ArtifactsCreateRepoResult> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		getArtifactsReposPath(accountId, namespace),
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}
	);
}

export async function listRepos(
	config: Config,
	namespace: string
): Promise<ArtifactsRepo[]> {
	const accountId = await requireAuth(config);
	return await fetchListResult(
		config,
		getArtifactsReposPath(accountId, namespace),
		{
			method: "GET",
		}
	);
}

export async function getRepo(
	config: Config,
	namespace: string,
	name: string
): Promise<ArtifactsRepo> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		getArtifactsRepoPath(accountId, namespace, name),
		{
			method: "GET",
		}
	);
}

export async function deleteRepo(
	config: Config,
	namespace: string,
	name: string
): Promise<void> {
	const accountId = await requireAuth(config);
	await fetchResult(config, getArtifactsRepoPath(accountId, namespace, name), {
		method: "DELETE",
	});
}

export async function issueRepoToken(
	config: Config,
	namespace: string,
	body: ArtifactsIssueTokenRequest
): Promise<ArtifactsIssueTokenResult> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`${getArtifactsNamespacePath(accountId, namespace)}/tokens`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}
	);
}
