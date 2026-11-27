import { createRequire } from "node:module";

/** The name and version of this package, read from its `package.json`. */
export const PACKAGE_INFO = createRequire(import.meta.url)(
	"../package.json"
) as { name: string; version: string };
