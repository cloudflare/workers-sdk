import {
	execFile,
	execFileSync,
	spawn,
	type ChildProcess,
} from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { release } from "node:os";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	checkExposedPorts,
	cleanupDuplicateImageTags,
	containerPrivilegesAllowed,
	verifyDockerInstalled,
} from "./../src/utils";
import type { ContainerDevOptions } from "../src/types";

type DockerExecFile = (
	file: string,
	args: readonly string[],
	options: object,
	callback: (error: Error | null, stdout: string) => void
) => ChildProcess;

const dockerExecFile = execFile as DockerExecFile;
let docketImageInspectResult = "0";

vi.mock("node:child_process");
vi.mock("node:fs");
vi.mock("node:os", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:os")>()),
	release: vi.fn(),
}));

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

describe("containerPrivilegesAllowed", () => {
	let commandError: Error | null;
	let rawResponse: string | undefined;
	let securityOptions: unknown;

	beforeEach(() => {
		commandError = null;
		rawResponse = undefined;
		securityOptions = ["name=seccomp"];
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(release).mockReturnValue("linux");
		vi.spyOn(process, "platform", "get").mockReturnValue("linux");
		vi.mocked(dockerExecFile).mockReset();
		vi.mocked(dockerExecFile).mockImplementation(
			(_file, _args, _options, callback) => {
				callback(commandError, rawResponse ?? JSON.stringify(securityOptions));
				return new EventEmitter() as ChildProcess;
			}
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("allows privileges with rootless Docker on Linux", async ({ expect }) => {
		securityOptions = ["name=seccomp", "name=rootless"];

		await expect(
			containerPrivilegesAllowed("unix:///run/user/1000/docker.sock")
		).resolves.toBe(true);
		expect(dockerExecFile).toHaveBeenCalledWith(
			"docker",
			[
				"--host",
				"unix:///run/user/1000/docker.sock",
				"info",
				"--format",
				"{{json .SecurityOptions}}",
			],
			{ encoding: "utf8", timeout: 5_000 },
			expect.any(Function)
		);
	});

	it("allows local VM-backed Docker engines on macOS", async ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

		await expect(
			containerPrivilegesAllowed("unix:///var/run/docker.sock")
		).resolves.toBe(true);
	});

	it("allows Colima-like Linux guests on macOS", async ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		securityOptions = [];

		await expect(
			containerPrivilegesAllowed(
				"unix:///Users/example/.colima/default/docker.sock"
			)
		).resolves.toBe(true);
	});

	it("blocks remote Docker engines", async ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

		await expect(
			containerPrivilegesAllowed("tcp://docker.example.com:2375")
		).resolves.toBe(false);
		expect(dockerExecFile).not.toHaveBeenCalled();
	});

	it("blocks Windows until workerd supports named pipes", async ({
		expect,
	}) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("win32");

		await expect(
			containerPrivilegesAllowed("//./pipe/docker_engine")
		).resolves.toBe(false);
	});

	it("blocks unsupported hosts", async ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("freebsd");

		await expect(
			containerPrivilegesAllowed("unix:///var/run/docker.sock")
		).resolves.toBe(false);
	});

	it("allows VM-backed Docker engines through WSL", async ({ expect }) => {
		vi.mocked(release).mockReturnValue("6.6.87.2-microsoft-standard-WSL2");

		await expect(
			containerPrivilegesAllowed("unix:///var/run/docker.sock")
		).resolves.toBe(true);
	});

	it("fails when Docker rejects the information request", async ({
		expect,
	}) => {
		commandError = new Error("Docker is unavailable");

		await expect(
			containerPrivilegesAllowed("unix:///var/run/docker.sock")
		).rejects.toThrow("Docker is unavailable");
	});

	it("fails when Docker returns malformed daemon information", async ({
		expect,
	}) => {
		rawResponse = "not JSON";

		await expect(
			containerPrivilegesAllowed("unix:///var/run/docker.sock")
		).rejects.toThrow();
	});

	it("blocks rootless Docker on Linux without /dev/fuse", async ({
		expect,
	}) => {
		vi.mocked(existsSync).mockReturnValue(false);
		securityOptions = ["name=rootless"];

		await expect(
			containerPrivilegesAllowed("unix:///run/user/1000/docker.sock")
		).resolves.toBe(false);
	});

	it("blocks rootful Docker on Linux", async ({ expect }) => {
		await expect(
			containerPrivilegesAllowed("unix:///var/run/docker.sock")
		).resolves.toBe(false);
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
