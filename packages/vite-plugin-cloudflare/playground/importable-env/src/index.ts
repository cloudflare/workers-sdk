import { env as importedEnv } from "cloudflare:workers";

type Env = Record<string, unknown>;

const key = "importable-env_VAR";
console.log(
	`outside of request handler: importedEnv["${key}"] === "${(importedEnv as Env)[key]}"`
);

export default {
	async fetch(_req, argEnv) {
		const entriesOfArgEnv = getEntriesOf(argEnv);
		const entriesOfImportedEnv = getEntriesOf(importedEnv);

		return Response.json({
			"entires of the fetch handler env": entriesOfArgEnv,
			"entries of the imported env": entriesOfImportedEnv,
			"are the two set of entries the same?":
				JSON.stringify(entriesOfArgEnv) ===
				JSON.stringify(entriesOfImportedEnv),
		});
	},
} satisfies ExportedHandler<Env>;

function getEntriesOf(obj: Object) {
	return Object.entries(obj).map(([key, value]) => ({ key, value }));
}
