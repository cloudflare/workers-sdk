import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, "../../");
		// The path to the extension test script
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, "./suite/index");
		const workspaceDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "vscode-workspace")
		);
		const userDataDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "vscode-extension")
		);

		// Download VS Code, unzip it and run the integration test
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			extensionTestsEnv: {
				VSCODE_WORKSPACE_PATH: workspaceDir,
			},
			launchArgs: [
				workspaceDir,
				// It will fail to save the user data and crash the next test run if the path is longer than 103 chars
				`--user-data-dir=${userDataDir}`,
				// This disables all extensions except the one being tested
				"--disable-extensions",
			],
		});
	} catch {
		console.error("Failed to run tests");
		process.exit(1);
	}
}

main();
