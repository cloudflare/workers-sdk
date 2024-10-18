import { vectorizeGABanner } from "./common";
import { handler as createHandler, options as createOptions } from "./create";
import {
	handler as createMetadataIndexHandler,
	options as createMetadataIndexOptions,
} from "./createMetadataIndex";
import { handler as deleteHandler, options as deleteOptions } from "./delete";
import {
	handler as deleteByIdsHandler,
	options as deleteByIdsOptions,
} from "./deleteByIds";
import {
	handler as deleteMetadataIndexHandler,
	options as deleteMetadataIndexOptions,
} from "./deleteMetadataIndex";
import { handler as getHandler, options as getOptions } from "./get";
import {
	handler as getByIdsHandler,
	options as getByIdsOptions,
} from "./getByIds";
import { handler as infoHandler, options as infoOptions } from "./info";
import { handler as insertHandler, options as insertOptions } from "./insert";
import { handler as listHandler, options as listOptions } from "./list";
import {
	handler as listMetadataIndexHandler,
	options as listMetadataIndexOptions,
} from "./listMetadataIndex";
import { handler as queryHandler, options as queryOptions } from "./query";
import { handler as upsertHandler, options as upsertOptions } from "./upsert";
import type { CommonYargsArgv } from "../yargs-types";

export function vectorize(yargs: CommonYargsArgv) {
	return yargs
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
		.command(
			"query <name>",
			"Query a Vectorize index",
			queryOptions,
			queryHandler
		)
		.command(
			"insert <name>",
			"Insert vectors into a Vectorize index",
			insertOptions,
			insertHandler
		)
		.command(
			"upsert <name>",
			"Upsert vectors into a Vectorize index",
			upsertOptions,
			upsertHandler
		)
		.command(
			"get-vectors <name>",
			"Get vectors from a Vectorize index",
			getByIdsOptions,
			getByIdsHandler
		)
		.command(
			"delete-vectors <name>",
			"Delete vectors in a Vectorize index",
			deleteByIdsOptions,
			deleteByIdsHandler
		)
		.command(
			"info <name>",
			"Get additional details about the index",
			infoOptions,
			infoHandler
		)
		.command(
			"create-metadata-index <name>",
			"Enable metadata filtering on the specified property",
			createMetadataIndexOptions,
			createMetadataIndexHandler
		)
		.command(
			"list-metadata-index <name>",
			"List metadata properties on which metadata filtering is enabled",
			listMetadataIndexOptions,
			listMetadataIndexHandler
		)
		.command(
			"delete-metadata-index <name>",
			"Delete metadata indexes",
			deleteMetadataIndexOptions,
			deleteMetadataIndexHandler
		)
		.epilogue(vectorizeGABanner);
}
