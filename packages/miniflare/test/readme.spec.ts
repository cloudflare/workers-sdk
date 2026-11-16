import assert from "node:assert";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "vitest";
import { useTmp } from "./test-shared";

const README_PATH = path.resolve(__dirname, "..", "README.md");
const MINIFLARE_ENTRY_PATH = path.resolve(
	__dirname,
	"..",
	"dist",
	"src",
	"index.js"
);

function getQuickStartExample(readme: string): string {
	const section = readme.split(/^## Quick Start$/m)[1]?.split(/^## /m)[0];
	assert(section !== undefined, "README.md has no `## Quick Start` section");
	const match = /^```js\n([\s\S]*?)^```$/m.exec(section);
	assert(match !== null, "README.md's Quick Start has no `js` code block");
	return match[1];
}

function runNode(
	scriptPath: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = childProcess.spawn(process.execPath, [scriptPath], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
		child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

// https://github.com/cloudflare/workers-sdk/issues/16965
test("README: Quick Start example runs against this version of Miniflare", async ({
	expect,
}) => {
	const readme = await fs.readFile(README_PATH, "utf8");
	const example = getQuickStartExample(readme);
	expect(example).toContain('from "miniflare"');

	// Run the example as a user would, with `miniflare` resolving to this build
	const tmp = await useTmp();
	const scriptPath = path.join(tmp, "quick-start.mjs");
	await fs.writeFile(
		scriptPath,
		example.replace(
			'from "miniflare"',
			`from ${JSON.stringify(pathToFileURL(MINIFLARE_ENTRY_PATH).href)}`
		)
	);

	const result = await runNode(scriptPath);
	expect(result.stderr).not.toContain("Unexpected options passed to");
	expect(result).toMatchObject({ code: 0, stdout: "Hello Miniflare!\n" });
});
