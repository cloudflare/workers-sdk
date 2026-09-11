import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { beforeEach, describe, it, vi } from "vitest";
import { dockerBuild } from "../src/build";

vi.mock("node:child_process");
vi.mock("node:fs");

/**
 * Creates a fake child process that emits a `close` event with the given exit code.
 *
 * @param exitCode - The exit code the fake process should emit.
 * @returns A minimal child-process-like object accepted by `spawn` callers.
 */
function createFakeChildProcess(
	exitCode: number,
	{
		stdout = "",
		stderr = "",
	}: {
		stdout?: string;
		stderr?: string;
	} = {}
): ReturnType<typeof spawn> {
	const emitter = new EventEmitter();
	const stdoutStream = new EventEmitter();
	const stderrStream = new EventEmitter();
	const stdin = { write: vi.fn(), end: vi.fn() };
	// Simulate async close so listeners are registered before the event fires.
	process.nextTick(() => {
		stdoutStream.emit("data", Buffer.from(stdout));
		stderrStream.emit("data", Buffer.from(stderr));
		emitter.emit("close", exitCode);
	});
	return Object.assign(emitter, {
		pid: 1234,
		stdin,
		stdout: stdoutStream,
		stderr: stderrStream,
		unref: vi.fn(),
	}) as unknown as ReturnType<typeof spawn>;
}

describe("dockerBuild", () => {
	beforeEach(() => {
		vi.mocked(spawn).mockReset();
	});

	it("throws a clear error without 'before building' when Docker is not running", async ({
		expect,
	}) => {
		// The first spawn call is for `docker info` (the verification check).
		// Return a fake process that exits with code 1 to simulate Docker not running.
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess(1));

		try {
			await dockerBuild("docker", {
				buildCmd: ["build", "-t", "test"],
				dockerfile: "FROM node:18",
			});
			expect.unreachable("Expected dockerBuild to throw");
		} catch (error) {
			const message = (error as Error).message;
			expect(message).toContain(
				"The Docker CLI is needed to build the image but could not be launched."
			);
			expect(message).not.toContain("before building");
		}
	});

	it("skips Docker verification when verifyDockerIsRunning is false", async ({
		expect,
	}) => {
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess(0));

		const result = await dockerBuild("docker", {
			buildCmd: ["build", "-t", "test"],
			dockerfile: "FROM node:18",
			verifyDockerIsRunning: false,
		});

		// The promise should resolve without calling docker info first.
		// spawn should only be called once (for the actual build, not for docker info).
		expect(spawn).toHaveBeenCalledTimes(1);
		expect(spawn).toHaveBeenCalledWith(
			"docker",
			["build", "--progress", "plain", "-t", "test"],
			{
				detached: process.platform !== "win32",
				stdio: ["pipe", "pipe", "pipe"],
				windowsHide: true,
			}
		);
		await result.ready;
	});

	it("inherits live output when requested", async ({ expect }) => {
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess(0));

		const result = await dockerBuild("docker", {
			buildCmd: ["build", "-t", "test"],
			dockerfile: "FROM node:18",
			verifyDockerIsRunning: false,
			outputMode: "inherit",
		});

		expect(spawn).toHaveBeenCalledWith("docker", ["build", "-t", "test"], {
			detached: process.platform !== "win32",
			stdio: ["pipe", "inherit", "inherit"],
			windowsHide: true,
		});
		await result.ready;
	});

	it("preserves an explicitly configured progress mode", async ({ expect }) => {
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess(0));

		const result = await dockerBuild("docker", {
			buildCmd: ["build", "--progress=rawjson", "-t", "test"],
			dockerfile: "FROM node:18",
			verifyDockerIsRunning: false,
		});

		expect(spawn).toHaveBeenCalledWith(
			"docker",
			["build", "--progress=rawjson", "-t", "test"],
			expect.any(Object)
		);
		await result.ready;
	});

	it("includes bounded captured output when a build fails", async ({
		expect,
	}) => {
		vi.mocked(spawn).mockReturnValue(
			createFakeChildProcess(1, {
				stderr: `discarded diagnostic\n${"x".repeat(64 * 1024)}\nuseful final error`,
			})
		);

		const result = await dockerBuild("docker", {
			buildCmd: ["build", "-t", "test"],
			dockerfile: "FROM node:18",
			verifyDockerIsRunning: false,
		});

		await expect(result.ready).rejects.toThrow("useful final error");
		await expect(result.ready).rejects.not.toThrow("discarded diagnostic");
	});
});
