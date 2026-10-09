import assert from "node:assert";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { fetch } from "miniflare";
import { test } from "vitest";
import { CoreHeaders } from "../../../src/workers/core/constants";
import { useTmp } from "../../test-shared";
import type { WorkflowStorageWorkerResponse } from "../../../src/plugins/workflows/storage";
import type { TestContext } from "vitest";

const SECRET = "workflow-storage-test-secret";

async function startStorage(
	persistPath: string,
	onTestFinished: TestContext["onTestFinished"]
) {
	const worker = new Worker(
		path.join(
			path.dirname(require.resolve("miniflare")),
			"plugins/workflows/storage-worker.js"
		),
		{ workerData: { persistPath, secret: SECRET } }
	);
	const exited = once(worker, "exit");
	let disposed = false;
	async function dispose() {
		if (!disposed) {
			disposed = true;
			worker.postMessage({ type: "dispose" });
		}
		const [code] = await exited;
		assert.equal(code, 0);
	}
	onTestFinished(dispose);
	const [message] = (await once(worker, "message")) as [
		WorkflowStorageWorkerResponse,
	];
	assert.equal(message.type, "ready");
	assert(message.type === "ready");
	const address = message.address;
	return {
		worker,
		address,
		dispose,
		async request(route: string, method = "GET", secret = SECRET) {
			return fetch(`http://${address}${route}`, {
				method,
				headers: { [CoreHeaders.LOOPBACK_SECRET]: secret },
			});
		},
		async configure(persistPath: string) {
			const configured = once(worker, "message");
			worker.postMessage({ type: "configure", persistPath });
			const [response] = (await configured) as [WorkflowStorageWorkerResponse];
			assert.equal(response.type, "configured");
		},
	};
}

test("authenticates Workflow storage requests and exposes no other loopback routes", async ({
	expect,
	onTestFinished,
}) => {
	const root = await useTmp();
	const storage = await startStorage(root, onTestFinished);
	const directory = path.join(root, "miniflare-workflows-test");
	await fs.mkdir(directory);
	await fs.writeFile(path.join(directory, "instance.sqlite"), "");
	for (const secret of ["", "wrong-secret"]) {
		const response = await storage.request(
			"/core/workflow-storage/test",
			"GET",
			secret
		);
		expect(response.status).toBe(403);
		await response.arrayBuffer();
	}
	const unrelated = await storage.request("/core/store-temp-file");
	expect(unrelated.status).toBe(404);
	await unrelated.arrayBuffer();
	const response = await storage.request("/core/workflow-storage/test");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual([
		{ name: "instance.sqlite", type: "file", birthtimeMs: expect.any(Number) },
	]);
});

test("rejects traversal and missing instance IDs", async ({
	expect,
	onTestFinished,
}) => {
	const storage = await startStorage(await useTmp(), onTestFinished);
	const routes = [
		`/core/workflow-storage/${encodeURIComponent("../../../outside")}`,
		`/core/workflow-storage/test/${encodeURIComponent("../../outside")}`,
		"/core/workflow-storage/test?waitForPendingDelete=1",
	];
	for (const route of routes) {
		const response = await storage.request(route, "DELETE");
		expect(response.status).toBe(400);
		await response.arrayBuffer();
	}
});

test("retains pending deletions across storage-root updates and drains them on disposal", async ({
	expect,
	onTestFinished,
}) => {
	const firstRoot = await useTmp();
	const secondRoot = await useTmp();
	const storage = await startStorage(firstRoot, onTestFinished);
	for (const root of [firstRoot, secondRoot]) {
		const directory = path.join(root, "miniflare-workflows-test");
		await fs.mkdir(directory);
		await fs.writeFile(path.join(directory, "instance.sqlite"), "");
		await fs.writeFile(path.join(directory, "instance.sqlite-wal"), "");
	}
	const response = await storage.request(
		"/core/workflow-storage/test/instance?defer=1",
		"DELETE"
	);
	expect(response.status).toBe(202);
	await response.arrayBuffer();
	await storage.configure(secondRoot);
	const newRoot = await storage.request("/core/workflow-storage/test");
	expect(await newRoot.json()).toHaveLength(2);
	await storage.dispose();
	expect(
		await fs.readdir(path.join(firstRoot, "miniflare-workflows-test"))
	).toEqual([]);
	expect(
		(await fs.readdir(path.join(secondRoot, "miniflare-workflows-test"))).sort()
	).toEqual(["instance.sqlite", "instance.sqlite-wal"]);
});

test("disposes without waiting for an unfinished HTTP request", async ({
	expect,
	onTestFinished,
}) => {
	const storage = await startStorage(await useTmp(), onTestFinished);
	const [host, port] = storage.address.split(":");
	const socket = net.connect({ host, port: Number(port) });
	const errors: NodeJS.ErrnoException[] = [];
	socket.on("error", (error) => errors.push(error));
	onTestFinished(() => {
		socket.destroy();
	});
	await once(socket, "connect");
	socket.write("GET /core/workflow-storage/test HTTP/1.1\r\n");
	const closed = new Promise<void>((resolve) => {
		socket.once("close", () => resolve());
	});
	await storage.dispose();
	await closed;
	expect(socket.destroyed).toBe(true);
	for (const error of errors) {
		expect(error.code).toBe("ECONNRESET");
	}
});
