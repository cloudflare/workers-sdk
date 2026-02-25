import assert from "node:assert";
import { existsSync, statSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import { spinner } from "@cloudflare/cli/interactive";

// TODO: the logic in this file is partially duplicated with the logic in packages/wrangler/src/autoconfig/c3-vendor/add-wrangler-gitignore.ts
//       and also in packages/wrangler/src/autoconfig/add-wrangler-assetsignore.ts, when we get rid of the c3-vendor directory
//       we should clean this duplication up

function directoryExists(path: string): boolean {
	const stat = statSync(path, { throwIfNoEntry: false });
	return stat?.isDirectory() ?? false;
}

export async function appendToGitIgnore(
	projectPath: string,
	textToAppend: string,
	spinnerOptions?: { startText: string; doneText: string }
) {
	const gitIgnorePath = `${projectPath}/.gitignore`;
	const gitIgnorePreExisted = existsSync(gitIgnorePath);

	const gitDirExists = directoryExists(`${projectPath}/.git`);

	if (!gitIgnorePreExisted && !gitDirExists) {
		// if there is no .gitignore file and neither a .git directory
		// then bail as the project is likely not targeting/using git
		return;
	}

	const s = spinnerOptions ? spinner() : null;

	if (spinnerOptions) {
		assert(s);
		s.start(spinnerOptions.startText);
	}

	if (!gitIgnorePreExisted) {
		await writeFile(gitIgnorePath, "");
	}

	await appendFile(gitIgnorePath, textToAppend);

	if (spinnerOptions) {
		assert(s);
		s.stop(spinnerOptions.doneText);
	}
}
