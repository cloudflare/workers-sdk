import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { ApiError, DeploymentsService } from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import { WebSocket } from "ws";
import { promiseSpinner } from "../cloudchamber/common";
import { logger } from "../logger";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { WranglerSSHResponse } from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";
import type { Server } from "node:net";

export function sshYargs(args: CommonYargsArgv) {
	return (
		args
			.positional("ID", {
				describe: "id of the container instance",
				type: "string",
				demandOption: true,
			})
			// Following are SSH flags that should be directly passed in
			.option("cipher", {
				describe:
					"Sets `ssh -c`: Select the cipher specification for encrypting the session",
				type: "string",
			})
			.option("log-file", {
				describe:
					"Sets `ssh -E`: Append debug logs to log_file instead of standard error",
				type: "string",
			})
			.option("escape-char", {
				describe:
					"Sets `ssh -e`: Set the escape character for sessions with a pty (default: ‘~’)",
				type: "string",
			})
			.option("config-file", {
				describe:
					"Sets `ssh -F`: Specify an alternative per-user ssh configuration file",
				type: "string",
			})
			.option("pkcs11", {
				describe:
					"`Sets `ssh -I`: Specify the PKCS#11 shared library ssh should use to communicate with a PKCS#11 token providing keys for user authentication",
				type: "string",
			})
			.option("identity-file", {
				describe:
					"Sets `ssh -i`: Select a file from which the identity (private key) for public key authentication is read",
				type: "string",
			})
			.option("mac-spec", {
				describe:
					"Sets `ssh -m`: A comma-separated list of MAC (message authentication code) algorithms, specified in order of preference",
				type: "string",
			})
			.option("option", {
				describe:
					"Sets `ssh -o`: Can be used to give options in the format used in the ssh configuration file",
				type: "string",
			})
			.option("tag", {
				describe:
					"Sets `ssh -P`: Specify a tag name that may be used to select configuration in ssh_config",
				type: "string",
			})
	);
}

export async function sshCommand(
	sshArgs: StrictYargsOptionsToInterface<typeof sshYargs>,
	_config: Config
) {
	if (sshArgs.ID.length !== 64) {
		throw new UserError(`Expected an instance ID but got ${sshArgs.ID}`);
	}

	// Check that ssh is enabled
	let sshResponse: WranglerSSHResponse;
	try {
		sshResponse = await promiseSpinner(
			DeploymentsService.containerWranglerSsh(sshArgs.ID),
			{ message: "Authenticating" }
		);
	} catch (e) {
		if (e instanceof ApiError) {
			throw new Error(
				"There has been an error verifying SSH access.\n" + e.body.error
			);
		}
		throw e;
	}

	const proxy = createSshTcpProxy(sshResponse);
	const proxyController = new AbortController();
	proxy.listen({ port: 0, signal: proxyController.signal });

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
			...buildSshArgs(sshArgs),
		],
		{
			stdio: ["inherit", "inherit", "inherit"],
			detached: true,
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
					new Error(`ssh exited unsuccessfully. Is the container running?`)
				);
			}
		});
	});
	await childKilled;

	proxyController.abort();
}

export function verifySshInstalled(sshPath: string): Promise<undefined> {
	return new Promise<undefined>((resolve, reject) => {
		const child = spawn(sshPath, ["-V"], {
			detached: true,
		});

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
				reject(new Error(`verifying ssh installation failed: ${err.message}`));
			}
		});
	});
}

/**
 * Creates a local TCP proxy that wraps data sent in a websocket binary
 * websocket message
 */
export function createSshTcpProxy(sshResponse: WranglerSSHResponse): Server {
	let hasConnection = false;
	const proxy = createServer((inbound) => {
		if (hasConnection) {
			inbound.end();
			return;
		}

		hasConnection = true;

		inbound.on("error", (err) => {
			logger.error("Proxy error: ", err);
		});

		const ws = new WebSocket(sshResponse.url, {
			headers: {
				authorization: `Bearer ${sshResponse.token}`,
				"user-agent": "wrangler",
			},
		});

		ws.binaryType = "arraybuffer";

		ws.addEventListener("error", (err) => {
			logger.error("Web socket error:", err.error);
			inbound.end();
			proxy.close();
		});

		ws.addEventListener("open", () => {
			inbound.on("data", (data) => {
				ws.send(data);
			});

			inbound.on("close", () => {
				ws.close();
				proxy.close();
			});

			ws.on("message", (data: ArrayBuffer) => {
				const arr = new Uint8Array(data);
				inbound.write(arr);
			});

			ws.addEventListener("close", () => {
				inbound.end();
				proxy.close();
			});
		});
	});

	return proxy;
}

function buildSshArgs(
	sshArgs: StrictYargsOptionsToInterface<typeof sshYargs>
): string[] {
	const flags: string[] = [];

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
		flags.push("-o", sshArgs.option);
	}

	if (sshArgs.tag !== undefined) {
		flags.push("-P", sshArgs.tag);
	}

	return flags;
}
