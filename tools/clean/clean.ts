import { rmSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cross-platform recursive directory/file removal utility.
 * Silently handles non-existent paths.
 */
export function clean(paths: string[]): void {
	for (const p of paths) {
		rmSync(resolve(p), { recursive: true, force: true });
	}
}

if (require.main === module) {
	clean(process.argv.slice(2));
}
