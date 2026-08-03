import { execFileSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { beforeEach, describe, it, vi } from "vitest";
import {
	checkExposedPorts,
	cleanupDuplicateImageTags,
	verifyDockerInstalled,
} from "./../src/utils";
import type { ContainerDevOptions } from "../src/types";

let docketImageInspectResult = "0";

vi.mock("node:child_process");

vi.mock("../src/inspect", async (importOriginal) => {
	const mod: object = await importOriginal();
	return {
		...mod,
		dockerImageInspect: () => docketImageInspectResult,
	};
});

const containerConfig = {
	dockerfile: "",
	class_name: "MyContainer",
} as ContainerDevOptions;
describe("checkExposedPorts", () => {
	beforeEach(() => {
		docketImageInspectResult = "1";
		vi.mocked(execFileSync).mockReset();
	});

	it("should not error when some ports are exported", async ({ expect }) => {
		docketImageInspectResult = "1";
		await expect(
			checkExposedPorts("docker", containerConfig)
		).resolves.toBeUndefined();
	});

	it("should error, with an appropriate message when no ports are exported", async ({
		expect,
	}) => {
		docketImageInspectResult = "0";
		await expect(checkExposedPorts("docker", containerConfig)).rejects
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: The container "MyContainer" does not expose any ports. In your Dockerfile, please expose any ports you intend to connect to.
				For additional information please see: https://developers.cloudflare.com/containers/local-dev/#exposing-ports.
				]
			`);
	});
});

describe("cleanupDuplicateImageTags", () => {
	beforeEach(() => {
		docketImageInspectResult = "";
		vi.mocked(execFileSync).mockReset();
		vi.mocked(execFileSync).mockReturnValue("");
	});

	it("does not remove sibling container tags from the same dev session", async ({
		expect,
	}) => {
		docketImageInspectResult = [
			"cloudflare-dev/egresstestcontainer:build-123",
			"cloudflare-dev/egresstest1container:build-123",
		].join("\n");

		await cleanupDuplicateImageTags(
			"docker",
			"cloudflare-dev/egresstest1container:build-123"
		);

		expect(execFileSync).not.toHaveBeenCalled();
	});

	it("removes stale cloudflare-dev tags from previous dev sessions", async ({
		expect,
	}) => {
		docketImageInspectResult = [
			"cloudflare-dev/egresstestcontainer:build-123",
			"cloudflare-dev/egresstest1container:build-123",
			"cloudflare-dev/egresstestcontainer:build-122",
			"user/image:latest",
		].join("\n");

		await cleanupDuplicateImageTags(
			"docker",
			"cloudflare-dev/egresstest1container:build-123"
		);

		expect(execFileSync).toHaveBeenCalledOnce();
		expect(execFileSync).toHaveBeenCalledWith(
			"docker",
			["rmi", "cloudflare-dev/egresstestcontainer:build-122"],
			{ encoding: "utf8" }
		);
	});
});

/**
 * Creates a fake child process that emits a `close` event with the given exit code.
 *
 * @param exitCode - The exit code the fake process should emit.
 * @returns A minimal child-process-like object accepted by `runDockerCmd`.
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

describe("verifyDockerInstalled", () => {
	beforeEach(() => {
		vi.mocked(spawn).mockReset();
	});

	it("does not throw when Docker is running", async ({ expect }) => {
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess(0));

		await expect(
			verifyDockerInstalled({
				dockerPath: "docker",
				imageNoun: "the image",
			})
		).resolves.toBeUndefined();
	});

	it("throws a UserError with the correct headline when Docker is not running", async ({
		expect,
	}) => {
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess(1));

		await expect(
			verifyDockerInstalled({
				dockerPath: "docker",
				operation: "running dev",
				imageNoun: "the configured image",
			})
		).rejects.toThrow(
			/The Docker CLI is needed to build the configured image before running dev but could not be launched/
		);
	});

	it("omits the 'before ...' clause when no operation is provided", async ({
		expect,
	}) => {
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess(1));

		await expect(
			verifyDockerInstalled({
				dockerPath: "docker",
				imageNoun: "the image",
			})
		).rejects.toThrow(
			/The Docker CLI is needed to build the image but could not be launched/
		);
	});

	it("includes the hint in the error message when provided", async ({
		expect,
	}) => {
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess(1));

		await expect(
			verifyDockerInstalled({
				dockerPath: "docker",
				operation: "running dev",
				imageNoun: "the configured images",
				hint: "Set enable_containers to false.",
			})
		).rejects.toThrow(/Set enable_containers to false\./);
	});

	it("omits the hint paragraph when no hint is provided", async ({
		expect,
	}) => {
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess(1));

		try {
			await verifyDockerInstalled({
				dockerPath: "docker",
				operation: "deploying",
				imageNoun: "the configured image",
			});
			// Should not reach here
			expect.unreachable("Expected verifyDockerInstalled to throw");
		} catch (error) {
			const message = (error as Error).message;
			expect(message).toContain(
				"The Docker CLI is needed to build the configured image before deploying but could not be launched."
			);
			expect(message).toContain("To fix this, try the following:");
			expect(message).toContain(
				"Note: Other container tooling that is compatible with the Docker CLI and engine may work"
			);
			// The message should end after the alternatives section -- no trailing hint.
			expect(message).not.toContain("To suppress this error");
			expect(message).not.toContain("--containers-rollout=none");
		}
	});

	it("uses the correct operation and image noun in the error headline", async ({
		expect,
	}) => {
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess(1));

		await expect(
			verifyDockerInstalled({
				dockerPath: "docker",
				operation: "deploying (even in dry-run mode)",
				imageNoun: "the configured images",
			})
		).rejects.toThrow(
			/The Docker CLI is needed to build the configured images before deploying \(even in dry-run mode\) but could not be launched/
		);
	});
});
