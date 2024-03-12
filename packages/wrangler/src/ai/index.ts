import * as ListCatalog from "./listCatalog";
import type { CommonYargsArgv } from "../yargs-types";

export function ai(yargs: CommonYargsArgv) {
	return yargs.command(
		"models",
		"🔹List catalog models",
		ListCatalog.options,
		ListCatalog.handler
	);
}
