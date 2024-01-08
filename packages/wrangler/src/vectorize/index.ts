import { vectorizeBetaWarning } from "./common";
import { options as createOptions, handler as createHandler } from "./create";
import { options as deleteOptions, handler as deleteHandler } from "./delete";
import { options as getOptions, handler as getHandler } from "./get";
import { options as insertOptions, handler as insertHandler } from "./insert";
import { options as listOptions, handler as listHandler } from "./list";
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
