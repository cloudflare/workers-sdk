import { statSync } from "node:fs";
import { join } from "node:path";
import * as walk from "empathic/walk";

/**
 * Lockfile file names in priority order.
 * Used for walking up from the project directory to find the nearest lockfile.
 *
 * `bun.lockb` is binary and cannot be parsed in JS — omitted intentionally.
 */
export const LOCKFILE_NAMES = [
	"pnpm-lock.yaml",
	"package-lock.json",
	"yarn.lock",
	"bun.lock",
] as const;

/**
 * The name of a lockfile that can be parsed.
 */
export type LockfileName = (typeof LOCKFILE_NAMES)[number];

/**
 * Walks up the directory tree from `startDir` to find the nearest lockfile.
 *
 * At each directory level, checks all lockfile names in priority order before
 * ascending to the parent. This ensures the nearest lockfile always wins,
 * and name-based priority only breaks ties within the same directory.
 *
 * @param startDir - The directory to start searching from
 * @param opts - Options
 * @param opts.last - If set, stop walking after this directory (inclusive).
 *                    Prevents discovery from reaching ancestor lockfiles.
 * @returns The lockfile path and its filename, or `undefined` if none is found
 */
export function findLockfile(
	startDir: string,
	opts: { last?: string } = {}
): { lockfilePath: string; name: LockfileName } | undefined {
	const dirs = walk.up(startDir, {
		cwd: startDir,
		last: opts.last,
	});

	for (const dir of dirs) {
		for (const name of LOCKFILE_NAMES) {
			const candidate = join(dir, name);
			try {
				if (statSync(candidate).isFile()) {
					return { lockfilePath: candidate, name };
				}
			} catch {
				// File doesn't exist or isn't accessible — try the next name
			}
		}
	}
	return undefined;
}
