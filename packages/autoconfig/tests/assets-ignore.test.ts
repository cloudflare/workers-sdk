import { readFileSync } from "node:fs";
import { maybeAppendWranglerToGitIgnoreLikeFile } from "@cloudflare/cli-shared-helpers/gitignore";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	getScaffoldedAssetsIgnorePatterns,
	getScaffoldedProjectAssetsIgnoreEntries,
} from "../src/assets-ignore";

describe("getScaffoldedAssetsIgnorePatterns", () => {
	runInTempDir();

	it("matches the rules written to a fresh scaffolded ignore file", ({
		expect,
	}) => {
		maybeAppendWranglerToGitIgnoreLikeFile(".assetsignore", {
			additionalEntries: getScaffoldedProjectAssetsIgnoreEntries([
				"bun.lockb",
				"bun.lock",
			]),
			requireEnvWildcard: true,
		});

		const writtenPatterns = readFileSync(".assetsignore", "utf8")
			.split(/\r?\n/)
			.filter((line) => line !== "" && !line.startsWith("#"));
		expect(getScaffoldedAssetsIgnorePatterns("bun")).toEqual(writtenPatterns);
	});
});
