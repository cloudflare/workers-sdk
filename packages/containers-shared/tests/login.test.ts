import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { ImageRegistriesService } from "../src/client";
import { OpenAPI } from "../src/client/core/OpenAPI";
import {
	configureOpenAPIForContainerPull,
	dockerLoginImageRegistry,
} from "../src/login";

vi.mock("node:child_process");

function createFakeChildProcess({
	exitCode,
	stdout = "",
	stderr = "",
	error,
}: {
	exitCode: number;
	stdout?: string;
	stderr?: string;
	error?: Error;
}): ReturnType<typeof spawn> {
	const emitter = new EventEmitter();
	const stdoutStream = new EventEmitter();
	const stderrStream = new EventEmitter();
	const stdin = { end: vi.fn() };
	process.nextTick(() => {
		stdoutStream.emit("data", Buffer.from(stdout));
		stderrStream.emit("data", Buffer.from(stderr));
		if (error) {
			emitter.emit("error", error);
		}
		emitter.emit("close", exitCode);
	});
	return Object.assign(emitter, {
		stdin,
		stdout: stdoutStream,
		stderr: stderrStream,
	}) as unknown as ReturnType<typeof spawn>;
}

describe("configureOpenAPIForContainerPull", () => {
	afterEach(() => {
		OpenAPI.BASE = "";
		OpenAPI.HEADERS = undefined;
		OpenAPI.CREDENTIALS = "include";
		vi.restoreAllMocks();
	});

	it("sets BASE, HEADERS, and CREDENTIALS", ({ expect }) => {
		configureOpenAPIForContainerPull("abc123", "my-token");
		expect(OpenAPI.BASE).toBe(
			"https://api.cloudflare.com/client/v4/accounts/abc123/containers"
		);
		expect(OpenAPI.CREDENTIALS).toBe("omit");
		expect((OpenAPI.HEADERS as Record<string, string>)["Authorization"]).toBe(
			"Bearer my-token"
		);
	});

	it("uses custom apiBase when provided", ({ expect }) => {
		configureOpenAPIForContainerPull(
			"abc123",
			"my-token",
			"https://staging.cloudflare.com/client/v4"
		);
		expect(OpenAPI.BASE).toBe(
			"https://staging.cloudflare.com/client/v4/accounts/abc123/containers"
		);
	});
});

describe("dockerLoginImageRegistry", () => {
	beforeEach(() => {
		vi.mocked(spawn).mockReset();
		vi.spyOn(
			ImageRegistriesService,
			"generateImageRegistryCredentials"
		).mockResolvedValue({
			account_id: "account-id",
			registry_host: "registry.example.com",
			username: "user",
			password: "secret",
		});
	});

	it("captures Docker's successful login output", async ({ expect }) => {
		const child = createFakeChildProcess({
			exitCode: 0,
			stdout: "Login Succeeded\n",
		});
		vi.mocked(spawn).mockReturnValue(child);

		await dockerLoginImageRegistry("docker", "registry.example.com", "capture");

		expect(spawn).toHaveBeenCalledWith(
			"docker",
			[
				"login",
				"--password-stdin",
				"--username",
				"user",
				"registry.example.com",
			],
			{ stdio: ["pipe", "pipe", "pipe"] }
		);
		expect(child.stdin?.end).toHaveBeenCalledWith("secret");
	});

	it("inherits Docker output when requested", async ({ expect }) => {
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess({ exitCode: 0 }));

		await dockerLoginImageRegistry("docker", "registry.example.com", "inherit");

		expect(spawn).toHaveBeenCalledWith("docker", expect.any(Array), {
			stdio: ["pipe", "inherit", "inherit"],
		});
	});

	it("includes captured diagnostics when login fails", async ({ expect }) => {
		vi.mocked(spawn).mockReturnValue(
			createFakeChildProcess({
				exitCode: 1,
				stderr: "Error response from daemon: denied",
			})
		);

		await expect(
			dockerLoginImageRegistry("docker", "registry.example.com", "capture")
		).rejects.toThrow(
			"Docker login failed with exit code 1:\nError response from daemon: denied"
		);
	});

	it("rejects cleanly when Docker cannot be spawned", async ({ expect }) => {
		vi.mocked(spawn).mockReturnValue(
			createFakeChildProcess({
				exitCode: -2,
				error: new Error("spawn docker ENOENT"),
			})
		);

		await expect(
			dockerLoginImageRegistry("docker", "registry.example.com", "capture")
		).rejects.toThrow("Docker login failed: spawn docker ENOENT");
	});
});
