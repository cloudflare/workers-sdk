import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { showCursor } from "@cloudflare/cli-shared-helpers";
import { bold } from "@cloudflare/cli-shared-helpers/colors";
import { WebSocket } from "ws";
import { ApiError, DeploymentsService } from "./client";
import { logger } from "./context";
import { promiseSpinner } from "./spinner";
import type { WranglerSSHResponse } from "./client";
import type { Server, Socket } from "node:net";
import type { RawData } from "ws";

export interface ContainerSshArgs {
	id: string;
	command?: string[];
	stdio?: boolean;
	cipher?: string;
	logFile?: string;
	escapeChar?: string;
	configFile?: string;
	pkcs11?: string;
	identityFile?: string;
	macSpec?: string;
	option?: string | string[];
	tag?: string;
}

// Deprecated SSH flags are hidden because a future SSH implementation
// will not use OpenSSH, at which point these options will not work.
export const containersSshOptions = {
	cipher: {
		describe:
			"Sets `ssh -c`: Select the cipher specification for encrypting the session",
		type: "string",
		hidden: true,
		deprecated: true,
	},
	"log-file": {
		describe:
			"Sets `ssh -E`: Append debug logs to log_file instead of standard error",
		type: "string",
		hidden: true,
		deprecated: true,
	},
	"escape-char": {
		describe:
			"Sets `ssh -e`: Set the escape character for sessions with a pty (default: '~')",
		type: "string",
		hidden: true,
		deprecated: true,
	},
	"config-file": {
		alias: "F",
		describe:
			"Sets `ssh -F`: Specify an alternative per-user ssh configuration file",
		type: "string",
		hidden: true,
		deprecated: true,
	},
	pkcs11: {
		describe:
			"Sets `ssh -I`: Specify the PKCS#11 shared library ssh should use to communicate with a PKCS#11 token providing keys for user authentication",
		type: "string",
		hidden: true,
		deprecated: true,
	},
	"identity-file": {
		alias: "i",
		describe:
			"Sets `ssh -i`: Select a file from which the identity (private key) for public key authentication is read",
		type: "string",
		hidden: true,
		deprecated: true,
	},
	"mac-spec": {
		describe:
			"Sets `ssh -m`: A comma-separated list of MAC (message authentication code) algorithms, specified in order of preference",
		type: "string",
		hidden: true,
		deprecated: true,
	},
	option: {
		alias: "o",
		describe:
			"Sets `ssh -o`: Set options in the format used in the ssh configuration file. May be repeated",
		type: "string",
		hidden: true,
		deprecated: true,
	},
	tag: {
		describe:
			"Sets `ssh -P`: Specify a tag name that may be used to select configuration in ssh_config",
		type: "string",
		hidden: true,
		deprecated: true,
	},
	stdio: {
		describe: "Proxy SSH traffic over stdin/stdout",
		type: "boolean",
	},
} as const;

/**
 * Connect to a Container over SSH. Before calling, configure the OpenAPI client
 * with the account API base URL and authentication, and call
 * initContainersSharedContext to supply the CLI's logger.
 */
export async function sshCommand(sshArgs: ContainerSshArgs) {
	const useStdio = shouldUseStdio(sshArgs);

	// Check that ssh is enabled
	let sshResponse: WranglerSSHResponse;
	try {
		const sshPromise = DeploymentsService.containerWranglerSsh(sshArgs.id);
		sshResponse = useStdio
			? await sshPromise
			: await promiseSpinner(sshPromise, { message: "Authenticating" });
	} catch (e) {
		if (e instanceof ApiError) {
			if (e.status === 404) {
				throw new Error(`Instance ${sshArgs.id} not found`);
			}

			let msg = `Error verifying SSH access`;
			if (e.body.error !== undefined) {
				msg += `: ${e.body.error}`;
			}

			throw new Error(msg);
		}

		throw e;
	}

	const ws = new WebSocket(sshResponse.url, {
		headers: {
			authorization: `Bearer ${sshResponse.token}`,
			"user-agent": "wrangler",
		},
	});

	ws.binaryType = "arraybuffer";

	if (useStdio) {
		await stdioProxy(ws);
		return;
	}

	const proxy = tcpProxy(ws);
	const proxyController = new AbortController();
	try {
		proxy.listen({
			port: 0,
			host: "127.0.0.1",
			signal: proxyController.signal,
		});
		await once(proxy, "listening");

		const proxyAddress = proxy.address();
		if (proxyAddress === null || typeof proxyAddress !== "object") {
			throw new Error("Couldn't get local SSH TCP proxy address");
		}

		await verifySshInstalled("ssh");

		const child = spawn(
			"ssh",
			[
				"cloudchamber@127.0.0.1",
				"-p",
				`${proxyAddress.port}`,
				...buildContainerSshArgs(sshArgs),
				"--",
				...(sshArgs.command ?? []),
			],
			{
				stdio: ["inherit", "inherit", "inherit"],
				detached: true,
				signal: proxyController.signal,
			}
		);

		const childKilled = new Promise((resolve, reject) => {
			child.on("close", () => {
				resolve(undefined);
			});

			child.on("error", reject);

			child.on("exit", (code) => {
				// Ssh errors exit with code 255
				if (code !== 255) {
					resolve(undefined);
				} else {
					reject(
						new Error(
							[
								"SSH exited unsuccessfully. Is the container running?",
								`${bold("NOTE:")} SSH does not automatically wake a container or count as activity to keep a container alive`,
							].join("\n")
						)
					);
				}
			});
		});

		// Ensure the cursor is visible.
		showCursor(true);

		await childKilled;
	} finally {
		// Restore terminal and transport state even when OpenSSH fails.
		showCursor(true);
		proxyController.abort();
		if (ws.readyState === WebSocket.CONNECTING) {
			ws.terminate();
		} else {
			ws.close();
		}
	}
}

export function verifySshInstalled(sshPath: string): Promise<undefined> {
	return new Promise<undefined>((resolve, reject) => {
		const child = spawn(sshPath, ["-V"]);

		let errorHandled = false;
		child.on("close", (code) => {
			if (code === 0) {
				resolve(undefined);
			} else if (!errorHandled) {
				errorHandled = true;
				reject(new Error(`ssh exited with status code: ${code}`));
			}
		});

		child.on("error", (err) => {
			if (!errorHandled) {
				errorHandled = true;
				reject(new Error(`Verifying SSH installation failed: ${err.message}`));
			}
		});
	});
}

/**
 * Creates a local TCP proxy that wraps data sent in a websocket binary
 * websocket message
 */
function tcpProxy(ws: WebSocket): Server {
	let inbound: Socket | undefined;
	const pending: Uint8Array[] = [];
	const proxy = createServer((socket) => {
		if (inbound !== undefined) {
			socket.end();
			return;
		}
		inbound = socket;
		socket.on("error", (err) => logger.error("Proxy error: ", err));
		socket.on("close", () => {
			ws.close();
			proxy.close();
		});
		// The WebSocket may already be open by the time OpenSSH connects.
		const start = () => socket.on("data", (data) => ws.send(data));
		if (ws.readyState === WebSocket.OPEN) {
			start();
		} else if (ws.readyState === WebSocket.CONNECTING) {
			ws.once("open", start);
		} else {
			socket.end();
		}
		for (const data of pending) {
			socket.write(data);
		}
		pending.length = 0;
	});
	ws.on("message", (data: ArrayBuffer) => {
		const bytes = new Uint8Array(data);
		if (inbound === undefined) {
			pending.push(bytes);
		} else {
			inbound.write(bytes);
		}
	});
	ws.on("error", (err) => {
		logger.error("Web socket error:", err.message);
		inbound?.end();
		proxy.close();
	});
	ws.on("close", () => {
		inbound?.end();
		proxy.close();
	});
	return proxy;
}

function stdioProxy(ws: WebSocket): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const onData = (data: Buffer | string) => ws.send(data);
		const onEnd = () => ws.close();
		const onError = (err: Error) => {
			ws.close();
			reject(err);
		};
		const cleanup = () => {
			process.stdin.pause();
			process.stdin.off("data", onData);
			process.stdin.off("end", onEnd);
			process.stdin.off("error", onError);
		};

		ws.addEventListener("error", (err) => {
			cleanup();
			reject(new Error(`Web socket error: ${err.message}`));
		});

		ws.addEventListener("open", () => {
			process.stdin.on("data", onData);
			process.stdin.on("end", onEnd);
			process.stdin.on("error", onError);
			process.stdin.resume();
		});

		ws.on("message", (data: RawData) => {
			process.stdout.write(formatWebSocketData(data));
		});

		ws.addEventListener("close", () => {
			cleanup();
			resolve(undefined);
		});
	});
}

function formatWebSocketData(data: RawData) {
	if (Array.isArray(data)) {
		return Buffer.concat(data);
	}
	return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}

export function shouldUseStdio(sshArgs: { stdio?: boolean }) {
	return (
		sshArgs.stdio === true ||
		(process.stdin.isTTY !== true && process.stdout.isTTY !== true)
	);
}

function buildContainerSshArgs(sshArgs: ContainerSshArgs): string[] {
	const flags = [
		// Never use a control socket.
		"-o",
		"ControlMaster=no",
		"-o",
		"ControlPersist=no",
		// Disable writing host keys to user known hosts file.
		"-o",
		"UserKnownHostsFile=/dev/null",
		// Do not perform strict host key checking: we use the same IP
		// address to connect to every container, all of which can have
		// separate host keys.
		"-o",
		"StrictHostKeyChecking=no",
	];

	// Hide warnings from SSH unless debug logging is enabled
	if (process.env.WRANGLER_LOG !== "debug") {
		flags.push("-o", "LogLevel=ERROR");
	}

	if (sshArgs.cipher !== undefined) {
		flags.push("-c", sshArgs.cipher);
	}

	if (sshArgs.logFile !== undefined) {
		flags.push("-E", sshArgs.logFile);
	}

	if (sshArgs.escapeChar !== undefined) {
		flags.push("-e", sshArgs.escapeChar);
	}

	if (sshArgs.configFile !== undefined) {
		flags.push("-F", sshArgs.configFile);
	}

	if (sshArgs.pkcs11 !== undefined) {
		flags.push("-I", sshArgs.pkcs11);
	}

	if (sshArgs.identityFile !== undefined) {
		flags.push("-i", sshArgs.identityFile);
	}

	if (sshArgs.macSpec !== undefined) {
		flags.push("-m", sshArgs.macSpec);
	}

	if (sshArgs.option !== undefined) {
		const options = Array.isArray(sshArgs.option)
			? sshArgs.option
			: [sshArgs.option];
		options.forEach((o) => flags.push("-o", o));
	}

	if (sshArgs.tag !== undefined) {
		flags.push("-P", sshArgs.tag);
	}

	return flags;
}
