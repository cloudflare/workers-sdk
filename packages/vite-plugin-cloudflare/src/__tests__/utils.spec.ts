import http from "node:http";
import net from "node:net";
import * as path from "node:path";
import { Response as MiniflareResponse } from "miniflare";
import { afterEach, beforeEach, describe, test } from "vitest";
import {
	createRequestHandler,
	getForwardedProto,
	getOutputDirectory,
} from "../utils";
import type { AddressInfo } from "node:net";

describe("getOutputDirectory", () => {
	test("returns the correct output if `environments[environmentName].build.outDir` is defined", ({
		expect,
	}) => {
		expect(
			getOutputDirectory(
				{
					environments: {
						worker: {
							build: { outDir: "custom-environment-output-directory" },
						},
					},
				},
				"worker"
			)
		).toBe("custom-environment-output-directory");
	});

	test("returns the correct output if `environments[environmentName].build.outDir` is not defined and `build.outDir` is defined", ({
		expect,
	}) => {
		expect(
			getOutputDirectory(
				{ build: { outDir: "custom-root-output-directory" } },
				"environment-name"
			)
		).toBe(path.join("custom-root-output-directory", "environment-name"));
	});

	test("returns the correct output if `environments[environmentName].build.outDir` and `build.outDir` are not defined", ({
		expect,
	}) => {
		expect(getOutputDirectory({}, "environment-name")).toBe(
			path.join("dist", "environment-name")
		);
	});
});

describe("getForwardedProto", () => {
	test("returns undefined when the header is missing", ({ expect }) => {
		expect(getForwardedProto({ headers: {} })).toBeUndefined();
	});

	test("returns https: when the header is `https`", ({ expect }) => {
		expect(
			getForwardedProto({ headers: { "x-forwarded-proto": "https" } })
		).toBe("https:");
	});

	test("returns http: when the header is `http`", ({ expect }) => {
		expect(
			getForwardedProto({ headers: { "x-forwarded-proto": "http" } })
		).toBe("http:");
	});

	test("is case-insensitive", ({ expect }) => {
		expect(
			getForwardedProto({ headers: { "x-forwarded-proto": "HTTPS" } })
		).toBe("https:");
	});

	test("trims surrounding whitespace", ({ expect }) => {
		expect(
			getForwardedProto({ headers: { "x-forwarded-proto": "  https  " } })
		).toBe("https:");
	});

	test("uses the left-most value when the header is a comma-separated proxy chain", ({
		expect,
	}) => {
		expect(
			getForwardedProto({ headers: { "x-forwarded-proto": "https, http" } })
		).toBe("https:");
	});

	test("returns undefined when the header is an unsupported value", ({
		expect,
	}) => {
		expect(
			getForwardedProto({ headers: { "x-forwarded-proto": "ws" } })
		).toBeUndefined();
	});

	test("returns undefined when the header is an empty string", ({ expect }) => {
		expect(
			getForwardedProto({ headers: { "x-forwarded-proto": "" } })
		).toBeUndefined();
	});
});

describe("createRequestHandler", () => {
	// Use a real HTTP server so that `req`, `res`, and `req.socket` look like
	// what `createRequest` from `@remix-run/node-fetch-server` expects in
	// production. This mirrors `websockets.spec.ts`.
	let httpServer: http.Server;
	let port: number;
	let capturedUrls: string[];

	beforeEach(async () => {
		capturedUrls = [];
	});

	afterEach(async () => {
		await new Promise<void>((resolve, reject) =>
			httpServer?.close((e) => (e ? reject(e) : resolve()))
		);
	});

	function startServer() {
		const handler = createRequestHandler(async (request) => {
			capturedUrls.push(request.url);
			return new MiniflareResponse("OK");
		});

		httpServer = http.createServer((req, res) => {
			void handler(
				req as unknown as Parameters<typeof handler>[0],
				res,
				(error: unknown) => {
					res.statusCode = 500;
					res.end(error instanceof Error ? error.message : String(error));
				}
			);
		});
		return new Promise<void>((r) =>
			httpServer.listen(0, "127.0.0.1", () => {
				port = (httpServer.address() as AddressInfo).port;
				r();
			})
		);
	}

	test("falls back to `http://` when no `X-Forwarded-Proto` header is set", async ({
		expect,
	}) => {
		await startServer();
		await fetch(`http://127.0.0.1:${port}/path`);
		expect(capturedUrls[0]).toBe(`http://127.0.0.1:${port}/path`);
	});

	test("honors the `X-Forwarded-Proto` header set to `https`", async ({
		expect,
	}) => {
		await startServer();
		await fetch(`http://127.0.0.1:${port}/path`, {
			headers: { "x-forwarded-proto": "https" },
		});
		expect(capturedUrls[0]).toBe(`https://127.0.0.1:${port}/path`);
	});

	test("honors the `X-Forwarded-Proto` header when it is case-insensitive", async ({
		expect,
	}) => {
		await startServer();
		await fetch(`http://127.0.0.1:${port}/path`, {
			headers: { "x-forwarded-proto": "HTTPS" },
		});
		expect(capturedUrls[0]).toBe(`https://127.0.0.1:${port}/path`);
	});

	test("uses the left-most value when `X-Forwarded-Proto` is a proxy chain", async ({
		expect,
	}) => {
		await startServer();
		await fetch(`http://127.0.0.1:${port}/path`, {
			headers: { "x-forwarded-proto": "https, http" },
		});
		expect(capturedUrls[0]).toBe(`https://127.0.0.1:${port}/path`);
	});

	test("ignores `X-Forwarded-Proto` when it holds an unsupported value", async ({
		expect,
	}) => {
		await startServer();
		await fetch(`http://127.0.0.1:${port}/path`, {
			headers: { "x-forwarded-proto": "ws" },
		});
		expect(capturedUrls[0]).toBe(`http://127.0.0.1:${port}/path`);
	});

	test("returns the Worker response when the Worker cancels an oversized body", async ({
		expect,
	}) => {
		const handler = createRequestHandler(async (request) => {
			const reader = request.body?.getReader();
			let total = 0;

			if (!reader) {
				return new MiniflareResponse(null, { status: 204 });
			}

			try {
				while (true) {
					const result = await reader.read();
					if (result.done) {
						break;
					}
					total += result.value.byteLength;

					if (total > 64 * 1024) {
						await reader.cancel();
						return MiniflareResponse.json(
							{ error: "The request body is too large." },
							{ status: 413 }
						);
					}
				}
			} finally {
				reader.releaseLock();
			}

			return new MiniflareResponse(null, { status: 204 });
		});

		httpServer = http.createServer((req, res) => {
			void handler(
				req as unknown as Parameters<typeof handler>[0],
				res,
				(error: unknown) => {
					res.statusCode = 500;
					res.setHeader("content-type", "text/plain");
					res.end(error instanceof Error ? error.message : String(error));
				}
			);
		});

		await new Promise<void>((r) =>
			httpServer.listen(0, "127.0.0.1", () => {
				port = (httpServer.address() as AddressInfo).port;
				r();
			})
		);

		for (let i = 0; i < 300; i++) {
			const response = await fetch(`http://127.0.0.1:${port}/upload`, {
				method: "POST",
				body: new ReadableStream({
					start(controller) {
						for (let j = 0; j < 8; j++) {
							controller.enqueue(new Uint8Array(16 * 1024));
						}
						controller.close();
					},
				}),
				duplex: "half",
			} as RequestInit & { duplex: "half" });

			expect(response.status).toBe(413);
			expect(await response.json()).toEqual({
				error: "The request body is too large.",
			});
		}
	});

	test("drains cancelled request bodies so keep-alive connections can be reused", async ({
		expect,
	}) => {
		const handler = createRequestHandler(async (request) => {
			if (request.method === "GET") {
				return new MiniflareResponse("OK");
			}

			const reader = request.body?.getReader();
			let total = 0;

			if (!reader) {
				return new MiniflareResponse(null, { status: 204 });
			}

			try {
				while (true) {
					const result = await reader.read();
					if (result.done) {
						break;
					}
					total += result.value.byteLength;

					if (total > 64 * 1024) {
						await reader.cancel();
						return new MiniflareResponse("Too large", { status: 413 });
					}
				}
			} finally {
				reader.releaseLock();
			}

			return new MiniflareResponse(null, { status: 204 });
		});

		httpServer = http.createServer((req, res) => {
			void handler(
				req as unknown as Parameters<typeof handler>[0],
				res,
				(error: unknown) => {
					res.statusCode = 500;
					res.setHeader("content-type", "text/plain");
					res.end(error instanceof Error ? error.message : String(error));
				}
			);
		});

		await new Promise<void>((r) =>
			httpServer.listen(0, "127.0.0.1", () => {
				port = (httpServer.address() as AddressInfo).port;
				r();
			})
		);

		const socket = net.connect(port, "127.0.0.1");
		try {
			const responses = await new Promise<string>((resolve, reject) => {
				let data = "";
				const timeout = setTimeout(() => {
					reject(new Error(`Timed out waiting for reused connection: ${data}`));
				}, 2000);

				socket.on("data", (chunk) => {
					data += chunk.toString("utf8");
					if (data.includes("HTTP/1.1 413") && data.includes("HTTP/1.1 200")) {
						clearTimeout(timeout);
						resolve(data);
					}
				});
				socket.on("error", (error) => {
					clearTimeout(timeout);
					reject(error);
				});

				socket.write(
					[
						"POST /upload HTTP/1.1",
						`Host: 127.0.0.1:${port}`,
						"Connection: keep-alive",
						"Content-Length: 131072",
						"",
						"",
					].join("\r\n")
				);
				socket.write(Buffer.alloc(131072));
				socket.write(
					[
						"GET /after-cancel HTTP/1.1",
						`Host: 127.0.0.1:${port}`,
						"Connection: close",
						"",
						"",
					].join("\r\n")
				);
			});

			expect(responses).toContain("HTTP/1.1 413");
			expect(responses).toContain("HTTP/1.1 200");
			expect(responses).toContain("OK");
		} finally {
			socket.destroy();
		}
	});
});
