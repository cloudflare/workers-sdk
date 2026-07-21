import { once } from "node:events";
import { onTestFinished, test, vi } from "vitest";
import { WebSocketServer } from "ws";
import { closeBrowserProcess } from "../../../src/plugins/browser-rendering/process";

test("gracefully closes Chrome over CDP", async ({ expect }) => {
	const closed = Promise.withResolvers<void>();
	const browserProcess = {
		hasClosed: vi.fn(() => closed.promise),
		kill: vi.fn(),
	};
	const server = new WebSocketServer({ port: 0 });
	onTestFinished(
		() => new Promise<void>((resolve) => server.close(() => resolve()))
	);
	await once(server, "listening");
	const address = server.address();
	if (typeof address === "string" || address === null) {
		throw new Error("Expected WebSocket server to listen on a TCP port");
	}
	server.on("connection", (socket) => {
		socket.once("message", (data) => {
			expect(JSON.parse(data.toString())).toEqual({
				id: 1,
				method: "Browser.close",
			});
			closed.resolve();
		});
	});

	await closeBrowserProcess(
		browserProcess,
		`ws://127.0.0.1:${address.port}`,
		100
	);

	expect(browserProcess.kill).not.toHaveBeenCalled();
});

test("force kills Chrome when graceful close times out", async ({ expect }) => {
	const closed = Promise.withResolvers<void>();
	const browserProcess = {
		hasClosed: vi.fn(() => closed.promise),
		kill: vi.fn(),
	};
	const server = new WebSocketServer({ port: 0 });
	onTestFinished(
		() => new Promise<void>((resolve) => server.close(() => resolve()))
	);
	await once(server, "listening");
	const address = server.address();
	if (typeof address === "string" || address === null) {
		throw new Error("Expected WebSocket server to listen on a TCP port");
	}

	await closeBrowserProcess(
		browserProcess,
		`ws://127.0.0.1:${address.port}`,
		10
	);

	expect(browserProcess.kill).toHaveBeenCalledOnce();
});
