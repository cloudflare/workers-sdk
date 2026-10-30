import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { APIError, parseNonHyphenedUuid } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { logger } from "../logger";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

type DelegatedDeploymentTarget = {
	projectPath: string;
	accountId: string;
	workerName: string;
};

function getOwnershipRecordPath(target: DelegatedDeploymentTarget): string {
	// Keep ownership with the project, outside disposable dependency caches.
	// Separate accounts and Worker names even when they share the same project.
	const key = createHash("sha256")
		.update(JSON.stringify([target.accountId, target.workerName]))
		.digest("hex");
	return resolve(
		target.projectPath,
		".wrangler/deployments/pages-to-workers",
		`${key}.json`
	);
}

/**
 * Verifies a previous deployment still belongs to the target Worker. A name
 * alone cannot prove ownership after a Worker is deleted and recreated.
 */
export async function hasSuccessfulDelegatedDeployment(
	target: DelegatedDeploymentTarget,
	config: ComplianceConfig
): Promise<boolean> {
	let record: unknown;
	try {
		record = JSON.parse(readFileSync(getOwnershipRecordPath(target), "utf8"));
	} catch {
		return false;
	}
	if (
		typeof record !== "object" ||
		record === null ||
		!("versionId" in record) ||
		typeof record.versionId !== "string" ||
		record.versionId.length === 0
	) {
		return false;
	}

	try {
		const version = await fetchResult<{ id: string }>(
			config,
			`/accounts/${encodeURIComponent(target.accountId)}/workers/scripts/${encodeURIComponent(target.workerName)}/versions/${encodeURIComponent(record.versionId)}`
		);
		return (
			typeof version.id === "string" &&
			parseNonHyphenedUuid(version.id) ===
				parseNonHyphenedUuid(record.versionId)
		);
	} catch (error) {
		if (error instanceof APIError && error.status === 404) {
			return false;
		}
		throw error;
	}
}

/**
 * Records a confirmed successful deployment so config-free projects can
 * redeploy. Record failures must not turn an already successful deploy into an
 * error; without a record, subsequent deploys retain collision protection.
 */
export function recordSuccessfulDelegatedDeployment(
	target: DelegatedDeploymentTarget,
	versionId: string
): void {
	try {
		const recordPath = getOwnershipRecordPath(target);
		mkdirSync(dirname(recordPath), { recursive: true });
		writeFileSync(recordPath, JSON.stringify({ versionId }));
	} catch (error) {
		logger.warn(
			"Could not save the deployment's local ownership record. A repeat delegated deploy may need a Wrangler configuration naming this Worker."
		);
		logger.debug(error);
	}
}
