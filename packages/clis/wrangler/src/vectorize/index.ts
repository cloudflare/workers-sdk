import { vectorizeBetaWarning } from "./common";
import { handler as createHandler, options as createOptions } from "./create";
import { handler as deleteHandler, options as deleteOptions } from "./delete";
import { handler as getHandler, options as getOptions } from "./get";
import { handler as insertHandler, options as insertOptions } from "./insert";
import { handler as listHandler, options as listOptions } from "./list";
import type { CommonYargsArgv } from "../yargs-types";

export function vectorize(yargs: CommonYargsArgv) {
	return (
		yargs
			.command(
				"create <name>",
				"Create a Vectorize index",
				createOptions,
				createHandler
			)
			.command(
				"delete <name>",
				"Delete a Vectorize index",
				deleteOptions,
				deleteHandler
			)
			.command(
				"get <name>",
				"Get a Vectorize index by name",
				getOptions,
				getHandler
			)
			.command("list", "List your Vectorize indexes", listOptions, listHandler)
			// TODO: coming during open beta
			// .command(
			// 	"query <name>",
			// 	"Query a Vectorize index",
			// 	queryOptions,
			// 	queryHandler
			// )
			.command(
				"insert <name>",
				"Insert vectors into a Vectorize index",
				insertOptions,
				insertHandler
			)
			.epilogue(vectorizeBetaWarning)
	);
}
