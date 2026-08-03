import { PassThrough } from "node:stream";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";
import type * as childProcess from "node:child_process";
import type * as nodeEvents from "node:events";
import type { WebSocket } from "ws";

vi.mock("node:child_process", async () => {
	const actual =
		await vi.importActual<typeof childProcess>("node:child_process");
	const { EventEmitter } =
		await vi.importActual<typeof nodeEvents>("node:events");

	return {
		...actual,
		spawn: vi.fn((...args: Parameters<typeof actual.spawn>) => {
			const [command, commandArgs] = args;
			if (command !== "ssh") {
				return actual.spawn(...args);
			}

			const child = new EventEmitter() as ReturnType<typeof actual.spawn>;
			const sshArgs = Array.isArray(commandArgs)
				? commandArgs.map((arg) => arg.toString())
				: [];
			const exitCode = sshArgs.length === 1 && sshArgs[0] === "-V" ? 0 : 255;

			setImmediate(() => {
				child.emit("exit", exitCode, null);
				child.emit("close", exitCode, null);
			});

			return child;
		}),
	};
});

describe("containers ssh", () => {
	const std = mockConsoleMethods();
	const originalStdin = process.stdin;
	const originalStdout = process.stdout;

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	afterEach(() => {
		msw.resetHandlers();
		Object.defineProperty(process, "stdin", {
			value: originalStdin,
			configurable: true,
		});
		Object.defineProperty(process, "stdout", {
			value: originalStdout,
			configurable: true,
		});
	});

	it("should help", async ({ expect }) => {
		await runWrangler("containers ssh --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers ssh <ID>

			SSH into a container

			POSITIONALS
			  ID  ID of the container instance  [string] [required]

			GLOBAL FLAGS
			  -c, --config          Path to Wrangler configuration file  [string]
			      --cwd             Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env             Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file        Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help            Show help  [boolean]
			      --install-skills  Install Cloudflare skills for detected AI coding agents before running the command  [boolean] [default: false]
			      --profile         Use a specific auth profile  [string]
			  -v, --version         Show version number  [boolean]

			OPTIONS
			      --stdio  Proxy SSH traffic over stdin/stdout  [boolean]"
		`);
	});

	it("should let the API validate invalid container ID format", async ({
		expect,
	}) => {
		setWranglerConfig({});
		const sshRequest = vi.fn();
		msw.use(
			http.get(`*/instances/:instanceId/ssh`, async ({ params }) => {
				sshRequest(params.instanceId);
				return HttpResponse.json(
					{ error: "INVALID_INSTANCE_ID" },
					{ status: 400 }
				);
			})
		);

		await expect(
			runWrangler("containers ssh invalid-id")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Error verifying SSH access: INVALID_INSTANCE_ID]`
		);
		expect(sshRequest).toHaveBeenCalledWith("invalid-id");
	});

	it("should handle 500s when getting ssh jwt", async ({ expect }) => {
		const instanceId = "a".repeat(64);

		setWranglerConfig({});
		msw.use(
			http.get(`*/instances/:instanceId/ssh`, async () => {
				return HttpResponse.json(
					{
						success: false,
						errors: [{ code: 1000, message: "something happened" }],
					},
					{ status: 500 }
				);
			})
		);

		await expect(
			runWrangler(`containers ssh ${instanceId}`)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`
			[Error: Error verifying SSH access: something happened]
		`
		);
	});

	// This covers up to trying to connect to the container with ssh. The
	// actual ssh attempt will fail since we don't have an ssh instance to test
	// against, but everything up until that point is covered.
	it("should try ssh'ing into a container", async ({ expect }) => {
		const instanceId = "a".repeat(64);
		const sshJwt = "asd";
		const server = await createWsServer();
		mockStdio({ stdinIsTTY: true, stdoutIsTTY: true });

		try {
			setWranglerConfig({});
			msw.use(
				http.get(`*/instances/:instanceId/ssh`, async () => {
					return HttpResponse.json(
						{ success: true, result: { url: server.url, token: sshJwt } },
						{ status: 200 }
					);
				})
			);

			const wrangler = runWrangler(`containers ssh ${instanceId}`);
			const expectedFailure = expect(wrangler).rejects.toMatchInlineSnapshot(`
				[Error: SSH exited unsuccessfully. Is the container running?
				NOTE: SSH does not automatically wake a container or count as activity to keep a container alive]
			`);
			const socket = await server.connection;
			socket.close();
			await expectedFailure;
		} finally {
			server.ws.close();
		}
	});

	it("should proxy stdin and stdout when stdio is forced", async ({
		expect,
	}) => {
		const instanceId = "a".repeat(64);
		const sshJwt = "asd";
		const server = await createWsServer();
		const { stdin, stdout } = mockStdio({
			stdinIsTTY: true,
			stdoutIsTTY: true,
		});

		setWranglerConfig({});
		msw.use(
			http.get(`*/instances/:instanceId/ssh`, async () => {
				return HttpResponse.json(
					{ success: true, result: { url: server.url, token: sshJwt } },
					{ status: 200 }
				);
			})
		);

		const stdoutData = new Promise<string>((resolve) => {
			stdout.on("data", (chunk: Buffer) => resolve(chunk.toString()));
		});
		const serverMessage = new Promise<string>((resolve) => {
			void server.connection.then((socket) => {
				socket.on("message", (chunk) => resolve(chunk.toString()));
			});
		});
		const wrangler = runWrangler(`containers ssh --stdio ${instanceId}`);

		const socket = await server.connection;
		stdin.write("client-data");
		await expect(serverMessage).resolves.toBe("client-data");

		socket.send("server-data");
		await expect(stdoutData).resolves.toBe("server-data");

		stdin.end();
		socket.close();
		await wrangler;
		server.ws.close();
		expect(std.out).toBe("");
		expect(stdin.listenerCount("data")).toBe(0);
		expect(stdin.listenerCount("end")).toBe(0);
		expect(stdin.listenerCount("error")).toBe(0);
	});

	it("should auto-detect proxy mode with extra args when stdin and stdout are not TTYs", async ({
		expect,
	}) => {
		const instanceId = "a".repeat(64);
		const sshJwt = "asd";
		const server = await createWsServer();
		const { stdin, stdout } = mockStdio({});

		setWranglerConfig({});
		msw.use(
			http.get(`*/instances/:instanceId/ssh`, async () => {
				return HttpResponse.json(
					{ success: true, result: { url: server.url, token: sshJwt } },
					{ status: 200 }
				);
			})
		);

		const stdoutData = new Promise<string>((resolve) => {
			stdout.on("data", (chunk: Buffer) => resolve(chunk.toString()));
		});
		const serverMessage = new Promise<string>((resolve) => {
			void server.connection.then((socket) => {
				socket.on("message", (chunk) => resolve(chunk.toString()));
			});
		});
		const wrangler = runWrangler(`containers ssh ${instanceId} -- 22`);

		const socket = await server.connection;
		stdin.write("client-data");
		await expect(serverMessage).resolves.toBe("client-data");

		socket.send("server-data");
		await expect(stdoutData).resolves.toBe("server-data");

		stdin.end();
		socket.close();
		await wrangler;
		server.ws.close();
		expect(std.out).toBe("");
	});
});

async function createWsServer() {
	const ws = new WebSocketServer({ port: 0 });
	await new Promise<void>((resolve) => ws.on("listening", resolve));
	const address = ws.address();
	if (address === null || typeof address === "string") {
		throw new Error("Expected WebSocket server to listen on a TCP port");
	}
	const connection = new Promise<WebSocket>((resolve) => {
		ws.on("connection", resolve);
	});
	return { ws, connection, url: `ws://127.0.0.1:${address.port}` };
}

function mockStdio({
	stdinIsTTY,
	stdoutIsTTY,
}: {
	stdinIsTTY?: boolean;
	stdoutIsTTY?: boolean;
}) {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	if (stdinIsTTY !== undefined) {
		Object.defineProperty(stdin, "isTTY", { value: stdinIsTTY });
	}
	if (stdoutIsTTY !== undefined) {
		Object.defineProperty(stdout, "isTTY", { value: stdoutIsTTY });
	}
	Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
	Object.defineProperty(process, "stdout", {
		value: stdout,
		configurable: true,
	});
	return { stdin, stdout };
}
