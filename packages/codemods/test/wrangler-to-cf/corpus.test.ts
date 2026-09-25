import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { globSync } from "tinyglobby";
import { describe, it } from "vitest";
import { migrateWranglerToCf } from "../../src";
import { getSyntaxErrors } from "./test-helpers";
import type { ExpectStatic } from "vitest";

const REPOSITORY_ROOT = path.resolve(__dirname, "../../../..");
const WRANGLER_CONFIG_PATHS = globSync(
	["**/wrangler.json", "**/wrangler.jsonc", "**/wrangler.toml"],
	{
		cwd: REPOSITORY_ROOT,
		ignore: [
			"**/.git/**",
			"**/.wrangler/**",
			"**/build/**",
			"**/dist/**",
			"**/node_modules/**",
			"packages/wrangler/wrangler.toml",
		],
	}
).sort();
const BUNDLERS = ["vite", "wrangler"] as const satisfies string[];
const MIGRATION_GUARD = `throw new Error("Migration incomplete. Resolve every cf migrate TODO in \`cloudflare.config.ts\`.");`;

async function assertGeneratedConfig(
	filePath: string,
	expect: ExpectStatic
): Promise<void> {
	const source = await readFile(filePath, "utf8");

	expect(getSyntaxErrors(source)).toEqual([]);
	expect(source).not.toContain("[object Object]");
}

describe("Wrangler configuration corpus", () => {
	runInTempDir();

	it("discovers the repository corpus", ({ expect }) => {
		expect(WRANGLER_CONFIG_PATHS.length).toBeGreaterThan(200);
	});

	it.for(WRANGLER_CONFIG_PATHS)(
		"migrates %s",
		async (configPath, { expect }) => {
			const sourcePath = path.join(REPOSITORY_ROOT, configPath);
			const source = await readFile(sourcePath, "utf8");

			for (const bundler of BUNDLERS) {
				const projectDirectory = path.join(process.cwd(), bundler);
				const wranglerPackageDirectory = path.join(
					projectDirectory,
					"node_modules",
					"wrangler"
				);
				const targetConfigPath = path.join(
					projectDirectory,
					path.basename(configPath)
				);
				await mkdir(wranglerPackageDirectory, { recursive: true });
				await writeFile(
					path.join(wranglerPackageDirectory, "package.json"),
					JSON.stringify({ name: "wrangler", version: "4.100.0" })
				);
				await writeFile(targetConfigPath, source);

				const result = await migrateWranglerToCf(targetConfigPath, {
					bundler,
					force: true,
				});
				const cloudflareConfigPath = path.join(
					projectDirectory,
					"cloudflare.config.ts"
				);
				const cloudflareConfig = await readFile(cloudflareConfigPath, "utf8");
				const hasBlockingFollowUp = result.followUps.some(
					({ blocking }) => blocking
				);

				expect(result.changedFiles).toContain("cloudflare.config.ts");
				expect(result.status).toBe(
					hasBlockingFollowUp ? "needs-intervention" : "complete"
				);
				expect(cloudflareConfig.includes(MIGRATION_GUARD)).toBe(
					hasBlockingFollowUp
				);
				await assertGeneratedConfig(cloudflareConfigPath, expect);

				if (result.changedFiles.includes("wrangler.config.ts")) {
					await assertGeneratedConfig(
						path.join(projectDirectory, "wrangler.config.ts"),
						expect
					);
				}
			}
		}
	);
});
