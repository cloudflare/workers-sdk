import { EventEmitter, once } from "node:events";
import { connect } from "node:net";
import { PassThrough } from "node:stream";
import { showCursor } from "@cloudflare/cli-shared-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { ApiError, DeploymentsService } from "../src/client";
import { shouldUseStdio, sshCommand } from "../src/ssh";
import type { ChildProcess } from "node:child_process";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
vi.mock("../src/spinner", () => ({
	promiseSpinner: <T>(promise: Promise<T>) => promise,
}));
vi.mock("@cloudflare/cli-shared-helpers", () => ({ showCursor: vi.fn() }));
const originalStdin = process.stdin;
const originalStdout = process.stdout;
const servers: WebSocketServer[] = [];

function streams(tty = false) {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	Object.defineProperty(stdin, "isTTY", { value: tty });
	Object.defineProperty(stdout, "isTTY", { value: tty });
	Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
	Object.defineProperty(process, "stdout", {
		value: stdout,
		configurable: true,
	});
	return { stdin, stdout };
}
async function server() {
	const ws = new WebSocketServer({ port: 0, host: "127.0.0.1" });
	servers.push(ws);
	await once(ws, "listening");
	const address = ws.address();
	if (typeof address === "string" || address === null) {
		throw new Error("No address");
	}
	vi.spyOn(DeploymentsService, "containerWranglerSsh").mockResolvedValue({
		url: `ws://127.0.0.1:${address.port}`,
		token: "ssh-token",
	});
	return ws;
}
beforeEach(() => {
	spawn.mockReset();
	vi.mocked(showCursor).mockClear();
	streams();
});
afterEach(() => {
	Object.defineProperty(process, "stdin", {
		value: originalStdin,
		configurable: true,
	});
	Object.defineProperty(process, "stdout", {
		value: originalStdout,
		configurable: true,
	});
	for (const ws of servers.splice(0)) {
		for (const socket of ws.clients) {
			socket.terminate();
		}
		ws.close();
	}
	vi.restoreAllMocks();
});

describe("shared Container SSH", () => {
	it("detects stdio mode and lets --stdio override a terminal", ({
		expect,
	}) => {
		expect(shouldUseStdio({})).toBe(true);
		streams(true);
		expect(shouldUseStdio({})).toBe(false);
		expect(shouldUseStdio({ stdio: true })).toBe(true);
	});
	it("proxies binary traffic without launching OpenSSH and removes stdin listeners", async ({
		expect,
	}) => {
		const { stdin, stdout } = streams(true);
		const ws = await server();
		const connected = once(ws, "connection");
		const run = sshCommand({ id: "instance", stdio: true });
		const [socket, request] = await connected;
		expect(request.headers.authorization).toBe("Bearer ssh-token");
		const received = once(socket, "message");
		// The client open event follows the server's connection event.
		await new Promise<void>((resolve) => setImmediate(resolve));
		stdin.write(Buffer.from([0, 255, 1]));
		expect((await received)[0]).toEqual(Buffer.from([0, 255, 1]));
		const output = once(stdout, "data");
		socket.send(Buffer.from([255, 0, 2]));
		expect((await output)[0]).toEqual(Buffer.from([255, 0, 2]));
		socket.close();
		await run;
		expect(spawn).not.toHaveBeenCalled();
		expect(stdin.isPaused()).toBe(true);
		for (const event of ["data", "end", "error"]) {
			expect(stdin.listenerCount(event)).toBe(0);
		}
	});
	it("preserves API error messages and missing-instance diagnostics", async ({
		expect,
	}) => {
		const call = vi.spyOn(DeploymentsService, "containerWranglerSsh");
		for (const [status, body, message] of [
			[404, {}, "Instance missing not found"],
			[
				400,
				{ error: "INVALID_INSTANCE_ID" },
				"Error verifying SSH access: INVALID_INSTANCE_ID",
			],
		] as const) {
			call.mockRejectedValueOnce(
				new ApiError(
					{ method: "GET", url: "/instances/missing/ssh" },
					{ url: "", ok: false, status, statusText: "Error", body },
					"Error"
				)
			);
			await expect(sshCommand({ id: "missing" })).rejects.toThrow(message);
		}
	});
	it("forwards commands and options when OpenSSH connects after the WebSocket opens", async ({
		expect,
	}) => {
		streams(true);
		const ws = await server();
		let closeChild: (() => void) | undefined;
		let childArgs: string[] = [];
		const connected = once(ws, "connection");
		spawn.mockImplementation((_command: string, args: string[]) => {
			const child = new EventEmitter() as ChildProcess;
			if (args[0] === "-V") {
				void connected.then(() => setTimeout(() => child.emit("close", 0), 20));
			} else {
				childArgs = args;
				const port = Number(args[args.indexOf("-p") + 1]);
				const tcp = connect(port, "127.0.0.1", () => tcp.write("client-ssh"));
				tcp.on("data", () => {
					tcp.end();
					child.emit("exit", 0);
					child.emit("close", 0);
				});
				closeChild = () => tcp.destroy();
			}
			return child;
		});
		const run = sshCommand({
			id: "instance",
			identityFile: "/tmp/key",
			option: ["A=yes", "B=no"],
			command: ["echo", "001"],
		});
		const [socket] = await connected;
		const received = once(socket, "message");
		expect((await received)[0].toString()).toBe("client-ssh");
		socket.send("server-ssh");
		await run;
		closeChild?.();
		expect(showCursor).toHaveBeenLastCalledWith(true);
		expect(childArgs).toEqual(
			expect.arrayContaining([
				"-i",
				"/tmp/key",
				"-o",
				"A=yes",
				"-o",
				"B=no",
				"--",
				"echo",
				"001",
			])
		);
	});
	for (const failure of ["missing-binary", "ssh-failed"]) {
		it(`closes its WebSocket after ${failure}`, async ({ expect }) => {
			streams(true);
			const ws = await server();
			const connected = once(ws, "connection");
			spawn.mockImplementation((_command: string, args: string[]) => {
				const child = new EventEmitter() as ChildProcess;
				void connected.then(() =>
					setImmediate(() => {
						if (args[0] === "-V" && failure === "missing-binary") {
							child.emit("error", new Error("ENOENT"));
						} else {
							const code = args[0] === "-V" ? 0 : 255;
							child.emit("exit", code);
							child.emit("close", code);
						}
					})
				);
				return child;
			});
			const run = sshCommand({ id: "instance" });
			const rejection = expect(run).rejects.toThrow(
				failure === "missing-binary"
					? "Verifying SSH installation failed"
					: "SSH exited unsuccessfully"
			);
			const [socket] = await connected;
			const closed = once(socket, "close");
			await rejection;
			await closed;
			expect(showCursor).toHaveBeenLastCalledWith(true);
		});
	}
});
