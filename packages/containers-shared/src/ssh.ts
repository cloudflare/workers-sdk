import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { WebSocket } from "undici";
import type { WranglerSSHResponse } from "./client";
import type { Server } from "node:net";

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

		const ws = new WebSocket(sshResponse.url, {
			headers: {
				authorization: `Bearer ${sshResponse.token}`,
				"user-agent": "wrangler",
			},
		});

		ws.addEventListener("error", (err) => {
			console.error("Web socket error:", err.error);
			inbound.end();
			proxy.close();
		});

		ws.addEventListener("open", () => {
			inbound.on("data", (data) => {
				ws.send(data);
			});

			inbound.on("error", (err) => {
				console.error("Proxy error: ", err);
			});

			inbound.on("close", () => {
				ws.close();
				proxy.close();
			});

			ws.addEventListener("message", async ({ data }) => {
				const arrayBuffer = await data.arrayBuffer();
				const arr = new Uint8Array(arrayBuffer);

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
