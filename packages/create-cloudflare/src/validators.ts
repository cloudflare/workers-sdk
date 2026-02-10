import { existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Arg } from "@cloudflare/cli/interactive";
import type { C3Args } from "types";

/**
 * unreadable regex copied from wrangler, which was basically copied from degit. i put some named capture
 * groups in, but uhh...there's not much to do short of using pomsky or some other tool.
 *
 * notably: this only supports `https://` and `git@` urls,
 * and is missing support for:
 * - `http`
 * - `ftp(s)`
 * - `file`
 * - `ssh`
 */
const TEMPLATE_REGEX =
	/^(?:(?:https:\/\/)?(?<httpsUrl>[^:/]+\.[^:/]+)\/|git@(?<gitUrl>[^:/]+)[:/]|(?<shorthandUrl>[^/]+):)?(?<user>[^/\s]+)\/(?<repository>[^/\s#]+)(?:(?<subdirectoryPath>(?:\/[^/\s#]+)+))?(?:\/)?(?:#(?<tag>.+))?/;

export const validateTemplateUrl = (value: Arg) => {
	if (!String(value).match(TEMPLATE_REGEX)) {
		return "Please enter a valid template url.";
	}
};

/**
 * Checks that a candidate project path is valid.
 *
 * To be a valid target for a c3 project, it must:
 * - Be empty (excluding a small allow-list of files)
 * - Be a valid pages project name
 *
 * @param relativePath - The path to the project directory
 * @param args - The parsed argument array that was passed to c3
 */
export const validateProjectDirectory = (
	relativePath: string,
	args: Partial<C3Args>,
) => {
	// Validate that the directory is non-existent or empty
	const path = resolve(relativePath);
	const existsAlready = existsSync(path);

	if (existsAlready) {
		for (const file of readdirSync(path)) {
			if (!isAllowedExistingFile(file)) {
				return `Directory \`${relativePath}\` already exists and contains files that might conflict. Please choose a new name.`;
			}
		}
	}

	// Ensure the name is valid per the pages schema
	// Skip this if we're initializing from an existing workers script, since some
	// previously created workers may have names containing capital letters
	if (!args.existingScript) {
		const projectName = basename(path);
		const invalidChars = /[^a-z0-9-]/;
		const invalidStartEnd = /^-|-$/;

		if (projectName.match(invalidStartEnd)) {
			return `Project names cannot start or end with a dash.`;
		}

		if (projectName.match(invalidChars)) {
			return `Project names must only contain lowercase characters, numbers, and dashes.`;
		}

		if (projectName.length > 58) {
			return `Project names must be less than 58 characters.`;
		}
	}
};

/**
 * Checks if the name of a file is exempt from the existing directory check. We do this
 * since C3 shouldn't prevent a user from using an existing directory if it only contains
 * benign config and/or other typical files created by the OS or an IDE.
 *
 * @param file - The filename to check
 */
export const isAllowedExistingFile = (file: string) => {
	const allowedExistingFiles = new Set([
		".DS_Store",
		".git",
		".gitattributes",
		".gitignore",
		".gitlab-ci.yml",
		".hg",
		".hgcheck",
		".hgignore",
		".idea",
		".npmignore",
		".travis.yml",
		".vscode",
		"Thumbs.db",
		"docs",
		"mkdocs.yml",
		"npm-debug.log",
		"yarn-debug.log",
		"yarn-error.log",
		"yarnrc.yml",
		".yarn",
		".gitkeep",
	]);

	if (allowedExistingFiles.has(file)) {
		return true;
	}

	const allowedExistingPatters = [
		/readme(\.md)?$/i,
		/license(\.md)?$/i,
		/\.iml$/,
		/^npm-debug\.log/,
		/^yarn-debug\.log/,
		/^yarn-error\.log/,
	];

	for (const regex of allowedExistingPatters) {
		if (regex.test(file)) {
			return true;
		}
	}

	return false;
};
