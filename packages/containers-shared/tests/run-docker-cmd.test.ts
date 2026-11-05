import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it, vi } from "vitest";
import { runDockerCmdWithOutput } from "../src/utils";

// A real subprocess stands in for a Docker CLI that cannot reach its daemon,
// so the test observes what Node writes to this process's stderr.
const unreachableDaemonArgs = [
	"-e",
	"process.stderr.write('Cannot connect to the Docker daemon'); process.exit(1)",
];

// How long the test gives the child process to finish before declaring the
// probe stuck. A best-effort cleanup probe must give up long before this.
const STUCK_AFTER_MS = 15_000;

describe("runDockerCmdWithOutput", () => {
	let leftovers: (() => void)[] = [];

	afterEach(() => {
		vi.restoreAllMocks();
		for (const cleanup of leftovers) {
			cleanup();
		}
		leftovers = [];
	});

	it("keeps a failed command's stderr out of the terminal and in the error", ({
		expect,
	}) => {
		const stderrWrite = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		expect(() =>
			runDockerCmdWithOutput(process.execPath, unreachableDaemonArgs)
		).toThrow("Cannot connect to the Docker daemon");
		expect(stderrWrite).not.toHaveBeenCalled();
	});

	// The synchronous call cannot be made in this process: an unresponsive
	// Docker CLI blocks execFileSync forever, which would hang vitest itself.
	// A child process isolates the call so the test fails instead of hanging.
	it(
		"gives up when the Docker CLI never responds",
		{ timeout: STUCK_AFTER_MS + 10_000 },
		async ({ expect }) => {
			const utilsPath = fileURLToPath(
				new URL("../src/utils.ts", import.meta.url)
			);
			const childScript = path.join(
				os.tmpdir(),
				`run-docker-cmd-stuck-${process.pid}.mjs`
			);
			fs.writeFileSync(
				childScript,
				`import { runDockerCmdWithOutput } from ${JSON.stringify(utilsPath)};
try {
	// A Docker CLI that never answers, standing in for an unresponsive engine.
	runDockerCmdWithOutput(process.execPath, [
		"-e",
		"setInterval(() => {}, 2147483647)",
	]);
	process.exit(0);
} catch {
	process.exit(1);
}
`
			);
			leftovers.push(() => fs.rmSync(childScript, { force: true }));

			const child = spawn(
				process.execPath,
				["--experimental-strip-types", childScript],
				{
					stdio: "ignore",
					// A process group keeps the hung "docker" grandchild reachable.
					detached: process.platform !== "win32",
				}
			);
			leftovers.push(() => {
				if (child.exitCode !== null) {
					return;
				}
				if (process.platform === "win32") {
					spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
				} else {
					process.kill(-child.pid, "SIGKILL");
				}
			});

			const exited = await exitsWithin(child, STUCK_AFTER_MS);
			expect(exited, "the Docker CLI call never gave up").toBe(true);
			expect(child.exitCode).toBe(1);
		}
	);
});

function exitsWithin(
	child: import("node:child_process").ChildProcess,
	ms: number
): Promise<boolean> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(false), ms);
		child.once("exit", () => {
			clearTimeout(timer);
			resolve(true);
		});
	});
}
