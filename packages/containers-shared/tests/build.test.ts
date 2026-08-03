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
function createFakeChildProcess(exitCode: number): ReturnType<typeof spawn> {
	const emitter = new EventEmitter();
	// Simulate async close so listeners are registered before the event fires.
	process.nextTick(() => emitter.emit("close", exitCode));
	return Object.assign(emitter, {
		pid: 1234,
		stdin: null,
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
		const fakeProcess = new EventEmitter();
		const fakeStdin = { write: vi.fn(), end: vi.fn() };
		Object.assign(fakeProcess, {
			pid: 1234,
			stdin: fakeStdin,
			unref: vi.fn(),
		});
		vi.mocked(spawn).mockReturnValue(
			fakeProcess as unknown as ReturnType<typeof spawn>
		);

		const resultPromise = dockerBuild("docker", {
			buildCmd: ["build", "-t", "test"],
			dockerfile: "FROM node:18",
			verifyDockerIsRunning: false,
		});

		// The promise should resolve without calling docker info first.
		// spawn should only be called once (for the actual build, not for docker info).
		expect(spawn).toHaveBeenCalledTimes(1);
		expect(spawn).toHaveBeenCalledWith(
			"docker",
			["build", "-t", "test"],
			expect.any(Object)
		);

		// Simulate successful build
		process.nextTick(() => fakeProcess.emit("exit", 0));
		const result = await resultPromise;
		await result.ready;
	});
});
