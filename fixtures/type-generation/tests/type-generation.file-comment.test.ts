import { execSync } from "child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { join } from "path";
import { beforeAll, describe, it } from "vitest";

describe("`wrangler types` - file comment", () => {
	let tempDir: string;

	beforeAll(() => {
		tempDir = realpathSync(mkdtempSync(join(tmpdir(), "wrangler-types-test")));
		const tomlFile = join(tempDir, "wrangler.toml");
		const tomlFileA = join(tempDir, "wranglerA.toml");
		writeFileSync(tomlFile, '\n[vars]\nMY_VAR = "my-var-value"\n');
		writeFileSync(tomlFileA, '\n[vars]\nMY_VAR = "my-var-value"\n');
	});

	function runWranglerTypesCommand(
		args = "",
		expectedOutputFile = "worker-configuration.d.ts"
	): string {
		const wranglerPath = path.resolve(
			__dirname,
			"..",
			"..",
			"..",
			"packages",
			"wrangler"
		);
		execSync(`npx ${wranglerPath} types ${args} --include-runtime=false`, {
			cwd: tempDir,
		});
		const typesFile = join(tempDir, expectedOutputFile);
		return readFileSync(typesFile, "utf-8");
	}

	describe("includes a comment specifying the command run", () => {
		it("(base command)", async ({ expect }) => {
			const typesCommandOutput = runWranglerTypesCommand();
			expect(typesCommandOutput).toContain(
				"by running `wrangler types --include-runtime=false`"
			);
		});

		it("(with types customization)", async ({ expect }) => {
			const typesCommandOutput = runWranglerTypesCommand(
				"--env-interface MyCloudflareEnv ./cflare-env.d.ts",
				"./cflare-env.d.ts"
			);
			expect(typesCommandOutput).toContain(
				"by running `wrangler types --env-interface MyCloudflareEnv ./cflare-env.d.ts --include-runtime=false`"
			);
		});

		it("(with wrangler top level options)", async ({ expect }) => {
			const typesCommandOutput = runWranglerTypesCommand("-c wranglerA.toml");
			expect(typesCommandOutput).toContain(
				"by running `wrangler types -c wranglerA.toml --include-runtime=false`"
			);
		});
	});
});
