import fs from "node:fs/promises";
import { render } from "ink";
import Table from "ink-table";
import React from "react";
import { fetchResult } from "../cfetch";
import { performApiFetch } from "../cfetch/internal";
import { formatBytes, formatTimeAgo } from "../formatTimeAgo";
import { requireAuth } from "../user";
import { getDatabaseByName } from "./list";
import type { Backup, Database } from "./types";
import type { Response } from "undici";
import type { ArgumentsCamelCase, Argv } from "yargs";

type BackupListArgs = { name: string };

export function ListOptions(yargs: Argv): Argv<BackupListArgs> {
	return yargs.positional("name", {
		describe: "The name of the DB",
		type: "string",
		demandOption: true,
	});
}

export async function ListHandler({
	name,
}: ArgumentsCamelCase<BackupListArgs>): Promise<void> {
	const accountId = await requireAuth({});
	const db: Database = await getDatabaseByName(accountId, name);

	const backups: Backup[] = await listBackups(accountId, db.uuid);
	render(
		<Table
			data={backups}
			columns={["created_at", "id", "num_tables", "size"]}
		></Table>
	);
}

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

type BackupCreateArgs = BackupListArgs;

export function CreateOptions(yargs: Argv): Argv<BackupCreateArgs> {
	return ListOptions(yargs);
}

export async function CreateHandler({
	name,
}: ArgumentsCamelCase<BackupCreateArgs>): Promise<void> {
	const accountId = await requireAuth({});
	const db: Database = await getDatabaseByName(accountId, name);

	const backup: Backup = await createBackup(accountId, db.uuid);
	render(
		<Table
			data={[backup]}
			columns={["created_at", "id", "num_tables", "size", "state"]}
		></Table>
	);
}

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

type BackupRestoreArgs = BackupListArgs & {
	"backup-id": string;
};

export function RestoreOptions(yargs: Argv): Argv<BackupRestoreArgs> {
	return ListOptions(yargs).positional("backup-id", {
		describe: "The Backup ID to restore",
		type: "string",
		demandOption: true,
	});
}

export async function RestoreHandler({
	name,
	backupId,
}: ArgumentsCamelCase<BackupRestoreArgs>): Promise<void> {
	const accountId = await requireAuth({});
	const db: Database = await getDatabaseByName(accountId, name);

	console.log(`Restoring ${name} from backup ${backupId}....`);
	await restoreBackup(accountId, db.uuid, backupId);
	console.log(`Done!`);
}

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

type BackupDownloadArgs = BackupRestoreArgs & {
	output?: string;
};

export function DownloadOptions(yargs: Argv): Argv<BackupDownloadArgs> {
	return ListOptions(yargs)
		.positional("backup-id", {
			describe: "The Backup ID to download",
			type: "string",
			demandOption: true,
		})
		.option("output", {
			describe:
				"The .sqlite3 file to write to (defaults to '<db-name>.<short-backup-id>.sqlite3'",
			type: "string",
		});
}

export async function DownloadHandler({
	name,
	backupId,
	output,
}: ArgumentsCamelCase<BackupDownloadArgs>): Promise<void> {
	const accountId = await requireAuth({});
	const db: Database = await getDatabaseByName(accountId, name);
	const filename = output || `./${name}.${backupId.slice(0, 8)}.sqlite3`;

	console.log(`Downloading backup ${backupId} of ${name} to: ${filename}`);
	const response = await getBackupResponse(accountId, db.uuid, backupId);
	console.log(`Got file. Saving...`);
	// TODO: stream this once we upgrade to Node18 and can use Writable.fromWeb
	const buffer = await response.arrayBuffer();
	await fs.writeFile(filename, new Buffer(buffer));
	console.log(`Done! Wrote ${filename} (${formatBytes(buffer.byteLength)})`);
}

export const getBackupResponse = async (
	accountId: string,
	uuid: string,
	backupId: string
): Promise<Response> => {
	return await performApiFetch(
		`/accounts/${accountId}/d1/database/${uuid}/backup/${backupId}/download`
	);
};
