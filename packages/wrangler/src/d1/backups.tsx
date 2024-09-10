import fs from "node:fs/promises";
import * as path from "path";
import Table from "ink-table";
import { fetchResult } from "../cfetch";
import { performApiFetch } from "../cfetch/internal";
import { defineCommand, defineNamespace } from "../core";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { renderToString } from "../utils/render";
import { formatBytes, formatTimeAgo } from "./formatTimeAgo";
import * as SharedArgs from "./options";
import { getDatabaseByNameOrBinding } from "./utils";
import type { Backup, Database } from "./types";
import type { Response } from "undici";

defineNamespace({
	command: "wrangler d1 backup",

	metadata: {
		description: "Interact with D1 backups",
		status: "stable",
		owner: "Product: D1",
	},
});

defineCommand({
	command: "wrangler d1 backup list",

	metadata: {
		description: "List your D1 backups",
		status: "stable",
		owner: "Product: D1",
	},

	positionalArgs: ["name"],
	args: {
		...SharedArgs.Name,
	},

	async handler({ name }, { config }) {
		const accountId = await requireAuth(config);

		const db: Database = await getDatabaseByNameOrBinding(
			config,
			accountId,
			name
		);

		const backups: Backup[] = await listBackups(accountId, db.uuid);
		logger.log(
			renderToString(
				<Table
					data={backups}
					columns={["created_at", "id", "num_tables", "size"]}
				></Table>
			)
		);
	},
});

defineCommand({
	command: "wrangler d1 backup create",

	metadata: {
		description: "Create a new D1 backup",
		status: "stable",
		owner: "Product: D1",
	},

	positionalArgs: ["name"],
	args: {
		...SharedArgs.Name,
	},

	async handler({ name }, { config }) {
		const accountId = await requireAuth(config);

		const db: Database = await getDatabaseByNameOrBinding(
			config,
			accountId,
			name
		);

		const backup: Backup = await createBackup(accountId, db.uuid);
		logger.log(
			renderToString(
				<Table
					data={[backup]}
					columns={["created_at", "id", "num_tables", "size", "state"]}
				></Table>
			)
		);
	},
});

defineCommand({
	command: "wrangler d1 backup restore",

	metadata: {
		description: "Restore a DB backup",
		status: "stable",
		owner: "Product: D1",
	},

	positionalArgs: ["name", "backup-id"],
	args: {
		...SharedArgs.Name,
		"backup-id": {
			describe: "The Backup ID to restore",
			type: "string",
			demandOption: true,
		},
	},

	async handler({ name, backupId }, { config }) {
		const accountId = await requireAuth(config);

		const db: Database = await getDatabaseByNameOrBinding(
			config,
			accountId,
			name
		);

		logger.log(`Restoring ${name} from backup ${backupId}....`);
		await restoreBackup(accountId, db.uuid, backupId);
		logger.log(`Done!`);
	},
});

defineCommand({
	command: "wrangler d1 backup download",

	metadata: {
		description: "Download a DB backup",
		status: "stable",
		owner: "Product: D1",
	},

	positionalArgs: ["name", "backup-id"],
	args: {
		...SharedArgs.Name,
		"backup-id": {
			describe: "The Backup ID to download",
			type: "string",
			demandOption: true,
		},
		output: {
			describe:
				"The .sqlite3 file to write to (defaults to '<db-name>.<short-backup-id>.sqlite3'",
			type: "string",
		},
	},

	async handler({ name, backupId, output }, { config }) {
		const accountId = await requireAuth(config);

		const db: Database = await getDatabaseByNameOrBinding(
			config,
			accountId,
			name
		);
		const filename =
			output || path.resolve(`${name}.${backupId.slice(0, 8)}.sqlite3`);

		logger.log(`🌀 Downloading backup ${backupId} from '${name}'`);
		const response = await getBackupResponse(accountId, db.uuid, backupId);
		if (!response.ok) {
			throw new Error(
				`Failed to download backup ${backupId} from '${name}' - got ${response.status} from the API`
			);
		}
		logger.log(`🌀 Saving to ${filename}`);
		// TODO: stream this once we upgrade to Node18 and can use Writable.fromWeb
		const buffer = await response.arrayBuffer();
		await fs.writeFile(filename, new Buffer(buffer));
		logger.log(`🌀 Done!`);
	},
});

export const listBackups = async (
	accountId: string,
	uuid: string
): Promise<Array<Backup>> => {
	const json: Backup[] = await fetchResult(
		`/accounts/${accountId}/d1/database/${uuid}/backup`,
		{}
	);
	const results: Record<string, Backup> = {};

	json
		// First, convert created_at to a Date
		.map((backup) => ({
			...backup,
			created_at: new Date(backup.created_at),
		}))
		// Then, sort descending based on created_at
		.sort((a, b) => +b.created_at - +a.created_at)
		// then group_by their human-readable timestamp i.e. "2 days ago"
		// (storing only the first of each group)
		// and replace the Date version with this new human-readable one
		.forEach((backup) => {
			const timeAgo = formatTimeAgo(backup.created_at);
			if (!results[timeAgo]) {
				results[timeAgo] = {
					...backup,
					created_at: timeAgo,
					size: formatBytes(backup.file_size),
				};
			}
		});

	// Take advantage of JS objects' sorting to return the newest backup of a certain age
	return Object.values(results);
};

export const createBackup = async (
	accountId: string,
	uuid: string
): Promise<Backup> => {
	const backup: Backup = await fetchResult(
		`/accounts/${accountId}/d1/database/${uuid}/backup`,
		{
			method: "POST",
		}
	);
	return {
		...backup,
		size: formatBytes(backup.file_size),
	};
};

export const restoreBackup = async (
	accountId: string,
	uuid: string,
	backupId: string
): Promise<void> => {
	await fetchResult(
		`/accounts/${accountId}/d1/database/${uuid}/backup/${backupId}/restore`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
};

export const getBackupResponse = async (
	accountId: string,
	uuid: string,
	backupId: string
): Promise<Response> => {
	return await performApiFetch(
		`/accounts/${accountId}/d1/database/${uuid}/backup/${backupId}/download`
	);
};
