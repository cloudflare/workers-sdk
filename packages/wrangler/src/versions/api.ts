import { fetchResult } from "../cfetch";
import { confirm } from "../dialogs";
import { APIError } from "../parse";
import type { TailConsumer } from "../config/environment";
import type {
	ApiDeployment,
	ApiVersion,
	Percentage,
	VersionCache,
	VersionId,
} from "./types";

export const CANNOT_ROLLBACK_WITH_MODIFIED_SECERT_CODE = 10220;

export async function fetchVersion(
	accountId: string,
	workerName: string,
	versionId: VersionId,
	versionCache?: VersionCache
) {
	const cachedVersion = versionCache?.get(versionId);
	if (cachedVersion) {
		return cachedVersion;
	}

	const version = await fetchResult<ApiVersion>(
		`/accounts/${accountId}/workers/scripts/${workerName}/versions/${versionId}`
	);

	versionCache?.set(version.id, version);

	return version;
}

export async function fetchVersions(
	accountId: string,
	workerName: string,
	versionCache: VersionCache | undefined,
	...versionIds: VersionId[]
) {
	return Promise.all(
		versionIds.map((versionId) =>
			fetchVersion(accountId, workerName, versionId, versionCache)
		)
	);
}

export async function fetchLatestDeployments(
	accountId: string,
	workerName: string
): Promise<ApiDeployment[]> {
	const { deployments } = await fetchResult<{
		deployments: ApiDeployment[];
	}>(`/accounts/${accountId}/workers/scripts/${workerName}/deployments`);

	return deployments;
}
export async function fetchLatestDeployment(
	accountId: string,
	workerName: string
): Promise<ApiDeployment | undefined> {
	const deployments = await fetchLatestDeployments(accountId, workerName);

	return deployments.at(0);
}

export async function fetchDeploymentVersions(
	accountId: string,
	workerName: string,
	deployment: ApiDeployment | undefined,
	versionCache: VersionCache
): Promise<[ApiVersion[], Map<VersionId, Percentage>]> {
	if (!deployment) {
		return [[], new Map()];
	}

	const versionTraffic = new Map(
		deployment.versions.map((v) => [v.version_id, v.percentage])
	);

	const versions = await fetchVersions(
		accountId,
		workerName,
		versionCache,
		...versionTraffic.keys()
	);

	return [versions, versionTraffic];
}

export async function fetchDeployableVersions(
	accountId: string,
	workerName: string,
	versionCache: VersionCache
): Promise<ApiVersion[]> {
	const { items: versions } = await fetchResult<{ items: ApiVersion[] }>(
		`/accounts/${accountId}/workers/scripts/${workerName}/versions?deployable=true`
	);

	for (const version of versions) {
		versionCache.set(version.id, version);
	}

	return versions;
}

export async function createDeployment(
	accountId: string,
	workerName: string,
	versionTraffic: Map<VersionId, Percentage>,
	message: string | undefined,
	force?: boolean
) {
	try {
		return await fetchResult(
			`/accounts/${accountId}/workers/scripts/${workerName}/deployments${force ? "?force=true" : ""}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					strategy: "percentage",
					versions: Array.from(versionTraffic).map(
						([version_id, percentage]) => ({ version_id, percentage })
					),
					annotations: {
						"workers/message": message,
					},
				}),
			}
		);
	} catch (e) {
		if (
			e instanceof APIError &&
			e.code === CANNOT_ROLLBACK_WITH_MODIFIED_SECERT_CODE
		) {
			// This is not great but is the best way I could think to handle for now
			const errorMsg = e.notes[0].text.replace(
				` [code: ${CANNOT_ROLLBACK_WITH_MODIFIED_SECERT_CODE}]`,
				""
			);
			const targetString = "The following secrets have changed:";
			const changedSecrets = errorMsg
				.substring(errorMsg.indexOf(targetString) + targetString.length + 1)
				.split(", ");

			const confirmed = await confirm(
				"The following secrets have changed since the target version was deployed. " +
					`Please confirm you wish to continue with the rollback\n` +
					changedSecrets.map((secret) => `  * ${secret}`).join("\n")
			);

			if (confirmed) {
				return await createDeployment(
					accountId,
					workerName,
					versionTraffic,
					message,
					true
				);
			} else {
				throw new Error("Aborting rollback...");
			}
		} else {
			throw e;
		}
	}
}

type NonVersionedScriptSettings = {
	logpush: boolean;
	tail_consumers: TailConsumer[];
};

export async function patchNonVersionedScriptSettings(
	accountId: string,
	workerName: string,
	settings: Partial<NonVersionedScriptSettings>
) {
	const res = await fetchResult<typeof settings>(
		`/accounts/${accountId}/workers/scripts/${workerName}/script-settings`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(settings),
		}
	);

	// TODO: handle specific errors

	return res;
}

export async function fetchNonVersionedScriptSettings(
	accountId: string,
	workerName: string
): Promise<NonVersionedScriptSettings> {
	const res = await fetchResult<NonVersionedScriptSettings>(
		`/accounts/${accountId}/workers/scripts/${workerName}/script-settings`,
		{ method: "GET" }
	);

	return res;
}
