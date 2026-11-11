import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import { afterAll, beforeAll, it } from "vitest";
import { LongLivedCommand, runCommand } from "./command";
import { makeRoot, seed } from "./setup";
import { waitFor } from "./wait-for";

const std = mockConsoleMethods();
const cwd = makeRoot();

beforeAll(async () => {
	await seed(cwd, {
		"cleanup.cjs": `
			process.stdout.write("cleanup stdout\\n");
			process.stderr.write("cleanup stderr\\n");
			process.exitCode = 1;
		`,
		"buffered-error.cjs": `
			process.stdout.write("x".repeat(256 * 1024) + "\\n");
			process.stderr.write("deployment failed at the end of the output\\n");
			process.exitCode = 1;
		`,
		"late-error.cjs": `
			process.stdout.end("uploading\\n");
			setTimeout(() => process.stderr.write("deployment failed after stdout closed"), 20);
			process.exitCode = 1;
		`,
		"running.cjs": `
			process.stdout.write("ready\\n");
			setInterval(() => {}, 1000);
		`,
		"timeout.cjs": `
			setTimeout(() => {}, process.env.KEEP_PIPES_OPEN ? 20_000 : 1000);
		`,
		"inherited-pipes.cjs": `
			const { spawn } = require("node:child_process");
			const child = spawn(process.execPath, ["timeout.cjs"], {
				stdio: ["ignore", "inherit", "inherit"],
				env: { ...process.env, KEEP_PIPES_OPEN: "true" },
			});
			child.unref();
			process.stdout.write("background child: " + child.pid + "\\n");
		`,
	});
});

afterAll(() => removeDir(cwd));

it("logs command failures by default", ({ expect }) => {
	const result = runCommand("node cleanup.cjs", { cwd });

	expect(result.status).toBe(1);
	expect(std.out).toContain("Running command: node cleanup.cjs");
	expect(std.out).toContain("cleanup stdout");
	expect(std.err).toContain("cleanup stderr");
});

it("captures cleanup failures without logging them in silent mode", ({
	expect,
}) => {
	const result = runCommand("node cleanup.cjs", { cwd, silent: true });

	expect(result.status).toBe(1);
	expect(result.stdout).toBe("cleanup stdout\n");
	expect(result.stderr).toBe("cleanup stderr\n");
	expect(std.out).toBe("");
	expect(std.err).toBe("");
});

it("waits for buffered failure output and can stop an already exited command", async ({
	expect,
}) => {
	const command = new LongLivedCommand("node buffered-error.cjs", {
		cwd,
		silent: true,
	});

	expect(await command.exitCode).toBe(1);
	const output = await command.output;
	expect(output).toContain("x".repeat(256 * 1024));
	expect(output).toContain("deployment failed at the end of the output");
	await command.stop();
	expect(std.out).toBe("");
	expect(std.err).toBe("");
});

it("captures stderr even when stdout closes first and the error has no final newline", async ({
	expect,
}) => {
	const command = new LongLivedCommand("node late-error.cjs", {
		cwd,
		silent: true,
	});

	expect(await command.exitCode).toBe(1);
	expect(await command.output).toBe(
		"uploading\ndeployment failed after stdout closed"
	);
});

it("streams readiness output and stops a running command", async ({
	expect,
	onTestFinished,
}) => {
	const command = new LongLivedCommand("node running.cjs", {
		cwd,
		silent: true,
	});
	onTestFinished(() => command.stop());

	await command.readUntil(/ready/, 5_000);
	await command.stop();
	expect(await command.output).toBe("ready");
	expect(std.err).toBe("");
});

it("stops quietly after a command times out while preserving the timeout error", async ({
	expect,
	onTestFinished,
}) => {
	const command = new LongLivedCommand("node timeout.cjs", {
		cwd,
		silent: true,
		timeout: 100,
	});
	onTestFinished(() => command.stop());

	await expect(command.exitCode).rejects.toMatchObject({ name: "AbortError" });
	await expect(command.output).rejects.toMatchObject({ name: "AbortError" });
	// Wait for termination before exercising cleanup of an already exited command.
	await waitFor(async () => {
		expect(await command.signal("SIGTERM")).toBe(false);
	});
	await expect(command.stop()).resolves.toBeUndefined();
	expect(std.out).toBe("");
	expect(std.err).toBe("");
});

it(
	"finishes when a background child keeps the exited command's output pipes open",
	{ timeout: 5_000 },
	async ({ expect, onTestFinished }) => {
		const command = new LongLivedCommand("node inherited-pipes.cjs", {
			cwd,
			silent: true,
		});
		let backgroundPid: number | undefined = undefined;
		onTestFinished(async () => {
			if (backgroundPid !== undefined) {
				try {
					process.kill(backgroundPid, "SIGKILL");
				} catch {
					// The background child may have exited during a test failure.
				}
			}
			await command.stop();
		});
		const match = await command.readUntil(/background child: (\d+)/);
		const childPid = Number(match[1]);
		backgroundPid = childPid;

		expect(await command.exitCode).toBe(0);
		expect(await command.output).toBe(`background child: ${childPid}`);
		expect(() => process.kill(childPid, 0)).not.toThrow();
		await command.stop();
		expect(std.out).toBe("");
		expect(std.err).toBe("");
	}
);
