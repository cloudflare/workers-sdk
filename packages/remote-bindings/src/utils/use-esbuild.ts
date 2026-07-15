import type { CfModule, CfModuleType, Entry } from "@cloudflare/workers-utils";
import type { Metafile } from "esbuild";

export type EsbuildBundle = {
	id: number;
	path: string;
	entrypointSource: string;
	entry: Entry;
	type: CfModuleType;
	modules: CfModule[];
	dependencies: Metafile["outputs"][string]["inputs"];
};
