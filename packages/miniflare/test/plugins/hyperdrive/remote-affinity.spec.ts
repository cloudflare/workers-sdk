import { once } from "node:events";
import net from "node:net";
import { newWebSocketRpcSession } from "capnweb";
import { LogLevel, Miniflare } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest, TestLog } from "../../test-shared";
import { useRemoteProxyServer } from "./helpers";
import type { Hyperdrive } from "@cloudflare/workers-types";
import type { MiniflareOptions } from "miniflare";

const script = `
import { connect } from "cloudflare:sockets";
export default {
  async fetch(request, env) {
    const socket = connect({ hostname: env.DB.host, port: env.DB.port });
    const writer = socket.writable.getWriter();
    await writer.write(new TextEncoder().encode(
      env.DB.user + ":" + env.DB.password + ":" + env.DB.database + "\\n"
    ));
    writer.releaseLock();
    return new Response(socket.readable);
  }
};
`;

test("Worker and Node clients use their session credentials across reloads and reconnects despite another binding failing", async ({
	expect,
}) => {
	const { edge, url } = await useRemoteProxyServer();
	let sessions = 0;
	let connections = 0;
	let failures = 0;
	edge.on("connection", (websocket, request) => {
		const broken =
			new URL(request.url ?? "/", "http://localhost").searchParams.get(
				"MF-Binding"
			) === "BROKEN";
		const password = broken ? "private-password" : `password-${++sessions}`;
		newWebSocketRpcSession(websocket as unknown as WebSocket, {
			getConnectionString() {
				if (broken) {
					failures++;
					throw new Error("private-password");
				}
				return `mysql://remote-user:${password}@hyperdrive.local:3306/remote-db`;
			},
			connect() {
				connections++;
				let controller: ReadableStreamDefaultController<Uint8Array>;
				let input = "";
				return {
					readable: new ReadableStream<Uint8Array>({
						start(streamController) {
							controller = streamController;
						},
					}),
					writable: new WritableStream<Uint8Array>({
						write(chunk) {
							input += new TextDecoder().decode(chunk);
							if (input.includes("\n")) {
								if (input !== `remote-user:${password}:remote-db\n`) {
									controller.error(new Error("Wrong session credentials"));
									throw new Error("Wrong session credentials");
								}
								controller.enqueue(new TextEncoder().encode("authenticated"));
								controller.close();
							}
						},
					}),
				};
			},
		});
	});
	const log = new TestLog();
	function getOptions(id: string): MiniflareOptions {
		return {
			log,
			workers: [
				{
					config: {
						name: "main",
						compatibilityDate: "2026-09-01",
						manifest: singleModuleManifest(script),
						env: {
							DB: {
								type: "hyperdrive",
								id,
								dev: {
									remote: true,
									connectionString: "unused-invalid-local",
								},
							},
							BROKEN: {
								type: "hyperdrive",
								id: "broken",
								dev: { remote: true },
							},
						},
					},
					dev: {
						remoteProxyConnectionString: url,
					},
				},
			],
		};
	}
	const mf = new Miniflare(getOptions("db"));
	try {
		await mf.ready;
		for (const mode of ["initial", "reload", "changed", "reconnect"]) {
			if (mode === "reconnect") {
				for (const websocket of edge.clients) {
					websocket.terminate();
				}
				await vi.waitFor(() =>
					expect(log.logsAtLevel(LogLevel.WARN).join("\n")).toContain(
						"was lost"
					)
				);
			}
			if (mode !== "initial") {
				await mf.setOptions(getOptions(mode === "reload" ? "db" : "next-db"));
			}
			const responses = await Promise.all(
				Array.from({ length: 3 }, async () => {
					const response = await mf.dispatchFetch("http://localhost/");
					return response.text();
				})
			);
			expect(responses).toEqual(Array(3).fill("authenticated"));
			const { DB } = await mf.getBindings<{ DB: Hyperdrive }>();
			expect(DB.user).toBe("remote-user");
			expect(DB.password).toBe(
				mode === "reconnect"
					? "password-3"
					: mode === "changed"
						? "password-2"
						: "password-1"
			);
			expect(DB.database).toBe("remote-db");
			expect(DB.host).toBe("127.0.0.1");
			const client = net.connect(DB.port, DB.host);
			try {
				client.write(`${DB.user}:${DB.password}:${DB.database}\n`);
				const [chunk] = await once(client, "data");
				expect(chunk.toString()).toBe("authenticated");
			} finally {
				client.destroy();
			}
		}
		expect(sessions).toBe(3);
		expect(connections).toBe(16);
		expect(failures).toBe(3);
		expect(log.logsAtLevel(LogLevel.WARN).join("\n")).toContain(
			'binding "BROKEN"'
		);
		expect(log.logsAtLevel(LogLevel.WARN).join("\n")).not.toContain(
			"private-password"
		);
	} finally {
		await mf.dispose();
	}
});
