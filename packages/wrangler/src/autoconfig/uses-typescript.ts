import { existsSync } from "node:fs";
import { join } from "node:path";

export function usesTypescript(projectPath: string) {
	return existsSync(join(projectPath, `tsconfig.json`));
}
