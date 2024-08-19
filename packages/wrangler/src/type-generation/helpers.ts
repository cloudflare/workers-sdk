import * as fs from "node:fs";
import { parseJSONC } from "../parse";

/**
 * Attempts to read the tsconfig.json at the current path.
 */
export function readTsconfigTypes(tsconfigPath: string): string[] {
	if (!fs.existsSync(tsconfigPath)) {
		return [];
	}

	try {
		const tsconfig = parseJSONC<TSConfig>(
			fs.readFileSync(tsconfigPath, "utf-8")
		);
		return tsconfig.compilerOptions?.types || [];
	} catch (e) {
		return [];
	}
}

type TSConfig = {
	compilerOptions: {
		types: string[];
	};
};

/**
 * Constructs a string representation of the existing types array with the new types path appended to.
 * It removes any existing types that are no longer relevant.
 */
export function buildUpdatedTypesString(
	types: string[],
	newTypesPath: string
): string | null {
	if (types.some((type) => type.includes(".wrangler/types/runtime"))) {
		return null;
	}

	const updatedTypesArray = types
		.filter((type) => !type.startsWith("@cloudflare/workers-types"))
		.concat([newTypesPath]);

	return JSON.stringify(updatedTypesArray);
}
