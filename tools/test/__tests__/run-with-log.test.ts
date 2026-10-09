import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, it } from "vitest";
import { clean } from "../../clean/clean";

const wrapper = path.resolve(__dirname, "../run-with-log.cjs");
let root: string;
beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), "ci-command-log-"));
});
afterEach(() => clean([root]));

it("flushes stdout and stderr and preserves a failed command's exit code", ({
	expect,
}) => {
	const script = path.join(root, "pnpm.cjs");
	const log = path.join(root, "logs/output.log");
	writeFileSync(
		script,
		`process.stdout.write('x'.repeat(1024 * 1024));
process.stderr.write('failure\\n');
process.exitCode = 7;`
	);
	const result = spawnSync(process.execPath, [wrapper, log, "run", "test:ci"], {
		encoding: "utf8",
		env: { ...process.env, npm_execpath: script },
		maxBuffer: 2 * 1024 * 1024,
	});
	expect(result.status).toBe(7);
	expect(result.stdout).toBe("x".repeat(1024 * 1024));
	expect(result.stderr).toBe("failure\n");
	const captured = readFileSync(log, "utf8");
	expect(captured.replace("failure\n", "")).toBe(result.stdout);
	expect(captured).toContain(result.stderr);
});

it.for([0, 7])(
	"returns promptly with exit code %i when an orphan retains the output pipes",
	(exitCode, { expect }) => {
		const script = path.join(root, "pnpm.cjs");
		const log = path.join(root, "logs/output.log");
		writeFileSync(
			script,
			`const {spawn} = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {stdio: ['ignore', 'inherit', 'inherit']});
child.unref();
console.log(child.pid);
console.error('failed command');
process.exitCode = ${exitCode};`
		);
		const start = performance.now();
		const result = spawnSync(
			process.execPath,
			[wrapper, log, "run", "test:ci"],
			{
				encoding: "utf8",
				env: { ...process.env, npm_execpath: script },
				timeout: 5_000,
			}
		);
		const pid = Number(result.stdout.trim());
		try {
			expect(result.status).toBe(exitCode);
			expect(result.error).toBeUndefined();
			expect(performance.now() - start).toBeLessThan(5_000);
			expect(readFileSync(log, "utf8")).toContain("failed command\n");
		} finally {
			if (Number.isSafeInteger(pid) && pid > 0) {
				process.kill(pid);
			}
		}
	}
);
