import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "vitest";

const binPath = resolve(__dirname, "../../bin/c3.js");
const pkgPath = resolve(__dirname, "../../package.json");
const minNodeVersion = JSON.parse(
	readFileSync(pkgPath, "utf-8")
).engines.node.replace(">=", "");

describe("check-node version gate", () => {
	test("outputs a useful error message when Node.js version is too old", ({
		expect,
	}) => {
		// We can't actually run on an old Node, but we can verify the bin file
		// contains the expected version gate by executing it with a mock that
		// overrides process.versions.node. We do this via --eval.
		const script = `
			// Override the node version to simulate an old version
			Object.defineProperty(process, "versions", {
				value: { ...process.versions, node: "18.0.0" },
			});
			require(${JSON.stringify(binPath)});
		`;

		try {
			execFileSync(process.execPath, ["--eval", script], {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			});
			// If it doesn't throw, that's unexpected
			expect.unreachable("Expected the process to exit with code 1");
		} catch (e: unknown) {
			const error = e as { status: number; stderr: string };
			expect(error.status).toBe(1);
			expect(error.stderr).toContain(
				`create-cloudflare requires at least Node.js v${minNodeVersion}`
			);
			expect(error.stderr).toContain("You are using v18.0.0");
			expect(error.stderr).toContain("https://volta.sh/");
		}
	});

	test("does not error when Node.js version meets the minimum", ({
		expect,
	}) => {
		// Running the bin file with the current Node.js (which is >= 20)
		// should not produce the version error. It will fail because
		// dist/cli.js may not exist, but that's a different error.
		try {
			execFileSync(process.execPath, [binPath], {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
				timeout: 5000,
			});
		} catch (e: unknown) {
			const error = e as { stderr: string };
			// Should NOT contain the version error
			expect(error.stderr).not.toContain(
				"create-cloudflare requires at least Node.js"
			);
		}
	});
});
