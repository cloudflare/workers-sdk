import { access } from "node:fs/promises";
import path from "node:path";
import { filterByFileRestrictions } from "../../files";
import { migrateWranglerToCf } from ".";
import type { Codemod, CodemodContext } from "../../types";

const DEFAULT_CONFIG_FILES = [
	"wrangler.json",
	"wrangler.jsonc",
	"wrangler.toml",
] as const;

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}

		throw error;
	}
}

async function getConfigPath(context: CodemodContext): Promise<string> {
	if (context.configPath) {
		return path.resolve(context.cwd, context.configPath);
	}

	const candidates = DEFAULT_CONFIG_FILES.map((fileName) =>
		path.join(context.cwd, fileName)
	);
	const existingCandidates = (
		await Promise.all(
			candidates.map(async (candidate) => ({
				candidate,
				exists: await fileExists(candidate),
			}))
		)
	)
		.filter(({ exists }) => exists)
		.map(({ candidate }) => candidate);

	if (existingCandidates.length === 1) {
		return existingCandidates[0];
	}
	if (existingCandidates.length === 0) {
		throw new Error(
			`No Wrangler config found in ${context.cwd}. Pass --config with the exact config path.`
		);
	}

	throw new Error(
		`Multiple Wrangler configs found in ${context.cwd}. Pass --config with the exact config path.`
	);
}

export const wranglerToCfCodemod: Codemod = {
	name: "wrangler-to-cf",
	aliases: ["wrangler to cf"],
	description: `Migrate a Wrangler configuration to the cf configuration format`,
	run: async (context) => {
		const configPath = await getConfigPath(context);
		const [includedConfigPath] = await filterByFileRestrictions(context, [
			configPath,
		]);
		if (!includedConfigPath) {
			return { changedFiles: [] };
		}

		const result = await migrateWranglerToCf(includedConfigPath, {
			bundler: context.bundler,
			dryRun: context.dryRun,
			force: context.force,
		});

		return {
			...result,
			changedFiles: result.changedFiles.map((filePath) =>
				path
					.relative(
						context.cwd,
						path.join(path.dirname(includedConfigPath), filePath)
					)
					.split(path.sep)
					.join(path.posix.sep)
			),
		};
	},
};
