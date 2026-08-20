import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chdir } from "node:process";
import { validateProjectDirectory } from "./validators";
import type { C3Context } from "types";

/**
 * Validates the target project directory and ensures its parent exists before
 * changing into it. Skips `mkdir` when the parent already exists so a Windows
 * drive root (`E:\`) does not throw `EPERM`.
 *
 * @param ctx - The C3 context containing the resolved project path and args
 */
export const setupProjectDirectory = (ctx: C3Context) => {
	const path = ctx.project.path;
	const err = validateProjectDirectory(path, ctx.args);
	if (err) {
		throw new Error(err);
	}

	const directory = dirname(path);

	// Creating a Windows drive root (`E:\`) throws EPERM. Skip if it already exists.
	if (!existsSync(directory)) {
		mkdirSync(directory, { recursive: true });
	}

	chdir(directory);
};
