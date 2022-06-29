import { fetchResult } from "../cfetch";
import { confirm } from "../dialogs";
import { requireAuth } from "../user";
import { getDatabaseByName } from "./list";
import type { Database } from "./types";
import type { ArgumentsCamelCase, Argv } from "yargs";

type CreateArgs = { name: string; "skip-confirmation": boolean };

export function Options(d1ListYargs: Argv): Argv<CreateArgs> {
	return d1ListYargs
		.positional("name", {
			describe: "The name of the DB",
			type: "string",
			demandOption: true,
		})
		.option("skip-confirmation", {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		});
}

export async function Handler({
	name,
	skipConfirmation,
}: ArgumentsCamelCase<CreateArgs>): Promise<void> {
	const accountId = await requireAuth({});

	const db: Database = await getDatabaseByName(accountId, name);

	console.log(`About to delete DB '${name}' (${db.uuid}).`);
	if (!skipConfirmation) {
		const response = await confirm(`Ok to proceed?`);
		if (!response) {
			console.log(`Not deleting.`);
			return;
		}
	}

	console.log("Deleting...");

	await fetchResult(`/accounts/${accountId}/d1/database/${db.uuid}`, {
		method: "DELETE",
	});

	console.log(`Deleted '${name}' successfully.`);
}
