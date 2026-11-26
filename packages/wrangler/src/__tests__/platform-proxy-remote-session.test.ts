import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import { UserError } from "@cloudflare/workers-utils";
import { afterEach, describe, it, vi } from "vitest";
import { startPlatformProxyRemoteSession } from "../api/integrations/platform/remote-session";
import { readConfig } from "../config";
import { logger } from "../logger";
import type { ChildProcess } from "node:child_process";

vi.mock(import("node:child_process"), async (importOriginal) => ({
	...(await importOriginal()),
	fork: vi.fn(),
}));

const config = {
	...readConfig({}),
	k2: [{ binding: "ORDERS", stream: "test-stream" }],
};
const sessionUrl = "http://127.0.0.1:1234/";

function mockChild() {
	const child = Object.assign(new EventEmitter(), {
		connected: true,
		disconnect: vi.fn(() => {
			child.connected = false;
		}),
		kill: vi.fn(() => true),
		send: vi.fn(() => true),
	});
	vi.mocked(fork).mockReturnValueOnce(child as unknown as ChildProcess);
	const exit = (code: number | null, signal: NodeJS.Signals | null) => {
		child.connected = false;
		child.emit("exit", code, signal);
	};
	return { child, exit };
}

describe("getPlatformProxy remote session IPC", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("returns the ready URL and disconnects once on disposal", async ({
		expect,
	}) => {
		const { child, exit } = mockChild();
		const warn = vi.spyOn(logger, "warn");
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "initial-token");
		const startup = startPlatformProxyRemoteSession(config);
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "changed-token");
		expect(fork).toHaveBeenCalledWith(
			expect.stringContaining("platform-proxy-remote-session.js"),
			expect.objectContaining({
				env: expect.objectContaining({ CLOUDFLARE_API_TOKEN: "initial-token" }),
				stdio: ["inherit", "inherit", "inherit", "ipc"],
			})
		);
		expect(child.send).toHaveBeenCalledWith(
			expect.objectContaining({
				bindings: expect.objectContaining({ ORDERS: expect.any(Object) }),
			}),
			expect.any(Function)
		);
		child.emit("message", { type: "ready", url: sessionUrl });
		const session = await startup;
		expect(session?.remoteProxyConnectionString.href).toBe(sessionUrl);
		const disposal = session?.dispose();
		expect(session?.dispose()).toBe(disposal);
		expect(child.disconnect).toHaveBeenCalledOnce();
		exit(0, null);
		await disposal;
		expect(child.kill).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
	});

	it("reconstructs a UserError with its telemetry message and stack", async ({
		expect,
	}) => {
		const { child, exit } = mockChild();
		const startup = startPlatformProxyRemoteSession(config);
		child.emit("message", {
			type: "error",
			message: "Could not start test session",
			stack: "session error stack",
			userError: true,
			telemetryMessage: "test session startup failed",
		});
		await vi.waitFor(() => expect(child.disconnect).toHaveBeenCalledOnce());
		exit(0, null);
		await expect(startup).rejects.toBeInstanceOf(UserError);
		await expect(startup).rejects.toMatchObject({
			message: "Could not start test session",
			stack: "session error stack",
			telemetryMessage: "test session startup failed",
		});
	});

	it("rejects startup when the child exits before readiness", async ({
		expect,
	}) => {
		const { child, exit } = mockChild();
		const startup = startPlatformProxyRemoteSession(config);
		exit(1, null);
		await expect(startup).rejects.toThrow("before it was ready (exit code 1)");
		expect(child.disconnect).not.toHaveBeenCalled();
		expect(child.kill).not.toHaveBeenCalled();
	});

	it("warns when a ready child exits unexpectedly", async ({ expect }) => {
		const { child, exit } = mockChild();
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		const startup = startPlatformProxyRemoteSession(config);
		child.emit("message", { type: "ready", url: sessionUrl });
		const session = await startup;
		exit(null, "SIGTERM");
		expect(warn).toHaveBeenCalledWith(
			"The getPlatformProxy remote session exited unexpectedly (SIGTERM)."
		);
		await session?.dispose();
		expect(child.disconnect).not.toHaveBeenCalled();
	});

	it("terminates a child that does not exit after disconnecting", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		const { child, exit } = mockChild();
		child.kill.mockImplementation(() => {
			exit(null, "SIGKILL");
			return true;
		});
		const startup = startPlatformProxyRemoteSession(config);
		child.emit("message", { type: "ready", url: sessionUrl });
		const session = await startup;
		const disposal = session?.dispose();
		expect(child.disconnect).toHaveBeenCalledOnce();
		expect(child.kill).not.toHaveBeenCalled();
		await vi.runAllTimersAsync();
		expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
		await disposal;
	});
});
