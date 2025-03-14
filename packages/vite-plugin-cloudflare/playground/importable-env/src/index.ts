import { env as importedEnv } from "cloudflare:workers";

// TODO: test a log here!

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
} satisfies ExportedHandler<Record<string, unknown>>;

function getEntriesOf(obj: Object) {
	return Object.entries(obj).map(([key, value]) => ({ key, value }));
}
