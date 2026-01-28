import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { showCursor } from "@cloudflare/cli";
import { bold } from "@cloudflare/cli/colors";
import { ApiError, DeploymentsService } from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import { WebSocket } from "ws";
import {
	fillOpenAPIConfiguration,
	promiseSpinner,
} from "../cloudchamber/common";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { containersScope } from "./index";
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
				describe: "ID of the container instance",
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
				alias: "F",
				describe:
					"Sets `ssh -F`: Specify an alternative per-user ssh configuration file",
				type: "string",
			})
			.option("pkcs11", {
				describe:
					"Sets `ssh -I`: Specify the PKCS#11 shared library ssh should use to communicate with a PKCS#11 token providing keys for user authentication",
				type: "string",
			})
			.option("identity-file", {
				alias: "i",
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
				alias: "o",
				describe:
					"Sets `ssh -o`: Set options in the format used in the ssh configuration file. May be repeated",
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
			if (e.status === 404) {
				throw new Error(`Instance ${sshArgs.ID} not found`);
			}

			let msg = `Error verifying SSH access`;
			if (e.body.error !== undefined) {
				msg += `: ${e.body.error}`;
			}

			throw new Error(msg);
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

	// Get arguments passed to the SSH command itself. yargs includes
	// "containers" and "ssh" as the first two elements of the array, which
	// we don't want, so we don't include those.
	const [, , ...rest] = sshArgs._;

	const child = spawn(
		"ssh",
		[
			"cloudchamber@127.0.0.1",
			"-p",
			`${proxyAddress.port}`,
			...buildSshArgs(sshArgs),
			"--",
			...rest.map((v) => v.toString()),
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

	// Hide the cursor again.
	showCursor(false);

	proxyController.abort();
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
			logger.error("Web socket error:", err.message);
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

export const containersSshCommand = createCommand({
	metadata: {
		description: "SSH into a container",
		status: "open beta",
		owner: "Product: Cloudchamber",
		hidden: true,
	},
	args: {
		ID: {
			describe: "ID of the container instance",
			type: "string",
			demandOption: true,
		},
		cipher: {
			describe:
				"Sets `ssh -c`: Select the cipher specification for encrypting the session",
			type: "string",
		},
		"log-file": {
			describe:
				"Sets `ssh -E`: Append debug logs to log_file instead of standard error",
			type: "string",
		},
		"escape-char": {
			describe:
				"Sets `ssh -e`: Set the escape character for sessions with a pty (default: '~')",
			type: "string",
		},
		"config-file": {
			alias: "F",
			describe:
				"Sets `ssh -F`: Specify an alternative per-user ssh configuration file",
			type: "string",
		},
		pkcs11: {
			describe:
				"Sets `ssh -I`: Specify the PKCS#11 shared library ssh should use to communicate with a PKCS#11 token providing keys for user authentication",
			type: "string",
		},
		"identity-file": {
			alias: "i",
			describe:
				"Sets `ssh -i`: Select a file from which the identity (private key) for public key authentication is read",
			type: "string",
		},
		"mac-spec": {
			describe:
				"Sets `ssh -m`: A comma-separated list of MAC (message authentication code) algorithms, specified in order of preference",
			type: "string",
		},
		option: {
			alias: "o",
			describe:
				"Sets `ssh -o`: Set options in the format used in the ssh configuration file. May be repeated",
			type: "string",
		},
		tag: {
			describe:
				"Sets `ssh -P`: Specify a tag name that may be used to select configuration in ssh_config",
			type: "string",
		},
	},
	positionalArgs: ["ID"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await sshCommand(args, config);
	},
});
