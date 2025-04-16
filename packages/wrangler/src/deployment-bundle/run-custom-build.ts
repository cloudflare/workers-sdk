import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import chalk from "chalk";
import { execaCommand } from "execa";
import { configFileName } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
import type { Config } from "../config";

/**
 * Run the custom build step, if one was provided.
 *
 * This function will also check whether the expected entry-point exists
 * once any custom build has run.
 */
export async function runCustomBuild(
	expectedEntryAbsolute: string,
	expectedEntryRelative: string,
	build: Pick<Config["build"], "command" | "cwd">,
	configPath: string | undefined
) {
	if (build.command) {
		logger.log(chalk.blue("[custom build]"), "Running:", build.command);
		try {
			const res = execaCommand(build.command, {
				shell: true,
				...(build.cwd && { cwd: build.cwd }),
			});
			res.stdout?.pipe(
				new Writable({
					write(chunk: Buffer, _, callback) {
						const lines = chunk.toString().split("\n");
						for (const line of lines) {
							logger.log(chalk.blue("[custom build]"), line);
						}
						callback();
					},
				})
			);
			res.stderr?.pipe(
				new Writable({
					write(chunk: Buffer, _, callback) {
						const lines = chunk.toString().split("\n");
						for (const line of lines) {
							logger.log(chalk.red("[custom build]"), line);
						}
						callback();
					},
				})
			);
			await res;
		} catch (e) {
			logger.error(e);
			throw new UserError(
				`Running custom build \`${build.command}\` failed. There are likely more logs from your build command above.`,
				{
					cause: e,
				}
			);
		}

		assertEntryPointExists(
			expectedEntryAbsolute,
			expectedEntryRelative,
			`The expected output file at "${expectedEntryRelative}" was not found after running custom build: ${build.command}.\n` +
				`The \`main\` property in your ${configFileName(configPath)} file should point to the file generated by the custom build.`
		);
	} else {
		assertEntryPointExists(
			expectedEntryAbsolute,
			expectedEntryRelative,
			`The entry-point file at "${expectedEntryRelative}" was not found.`
		);
	}
}

/**
 * Throws an error if the given entry point file does not exist.
 */
function assertEntryPointExists(
	expectedEntryAbsolute: string,
	expectedEntryRelative: string,
	errorMessage: string
) {
	if (!fileExists(expectedEntryAbsolute)) {
		throw new UserError(
			getMissingEntryPointMessage(
				errorMessage,
				expectedEntryAbsolute,
				expectedEntryRelative
			)
		);
	}
}

/**
 * Generate an appropriate message for when the entry-point is missing.
 *
 * To be more helpful to developers, we check whether there is a suitable file
 * nearby to the expected file path.
 */
function getMissingEntryPointMessage(
	message: string,
	absoluteEntryPointPath: string,
	relativeEntryPointPath: string
): string {
	if (
		existsSync(absoluteEntryPointPath) &&
		statSync(absoluteEntryPointPath).isDirectory()
	) {
		// The expected entry-point is a directory, so offer further guidance.
		message += `\nThe provided entry-point path, "${relativeEntryPointPath}", points to a directory, rather than a file.\n`;

		// Perhaps we can even guess what the correct path should be...
		const possiblePaths: string[] = [];
		for (const basenamePath of [
			"worker",
			"dist/worker",
			"index",
			"dist/index",
		]) {
			for (const extension of [".ts", ".tsx", ".js", ".jsx"]) {
				const filePath = basenamePath + extension;
				if (fileExists(path.resolve(absoluteEntryPointPath, filePath))) {
					possiblePaths.push(path.join(relativeEntryPointPath, filePath));
				}
			}
		}

		if (possiblePaths.length > 0) {
			message +=
				`\nDid you mean to set the main field to${
					possiblePaths.length > 1 ? " one of" : ""
				}:\n` +
				"```\n" +
				possiblePaths.map((filePath) => `main = "./${filePath}"\n`).join("") +
				"```";
		}
	}
	return message;
}

/**
 * Returns true if the given `filePath` exists as-is,
 * or if some version of it (by appending a common extension) exists.
 */

function fileExists(filePath: string): boolean {
	const SOURCE_FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
	if (path.extname(filePath) !== "") {
		return existsSync(filePath);
	}
	const base = path.join(path.dirname(filePath), path.basename(filePath));
	for (const ext of SOURCE_FILE_EXTENSIONS) {
		if (existsSync(base + ext)) {
			return true;
		}
	}
	return false;
}
