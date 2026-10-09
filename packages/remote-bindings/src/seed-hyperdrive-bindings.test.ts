import assert from "node:assert";
import { once } from "node:events";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { seedRemoteHyperdriveBindings } from "./seed-hyperdrive-bindings";
import type { Binding } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

const connectionString =
	"mysql://edge-user:edge-password@hyperdrive.local:3306/config";
const remoteBinding = {
	type: "hyperdrive",
	id: "config",
	remote: true,
} satisfies Binding;
let server: WebSocketServer;
let remoteProxyConnectionString: RemoteProxyConnectionString;
let requests: Map<string, number>;

beforeEach(async () => {
	requests = new Map();
	server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
	await once(server, "listening");
	const address = server.address();
	assert(address !== null && typeof address !== "string");
	remoteProxyConnectionString = new URL(
		`http://127.0.0.1:${address.port}`
	) as RemoteProxyConnectionString;
	server.on("headers", (headers, request) => {
		const bindingName = request.headers["mf-binding"];
		assert(typeof bindingName === "string");
		const attempt = (requests.get(bindingName) ?? 0) + 1;
		requests.set(bindingName, attempt);
		if (
			bindingName === "HEALTHY" ||
			(bindingName === "TRANSIENT" && attempt > 1)
		) {
			headers.push(`MF-HD-Connection-String: ${connectionString}`);
		}
	});
});

afterEach(async () => {
	for (const socket of server.clients) {
		socket.terminate();
	}
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
});

describe("seedRemoteHyperdriveBindings", () => {
	it("keeps successful seeds when another binding fails", async ({
		expect,
	}) => {
		const warn = vi.fn();
		const bindings = {
			HEALTHY: { ...remoteBinding },
			BROKEN: { ...remoteBinding },
		};
		const originalBindings = structuredClone(bindings);
		const result = await seedRemoteHyperdriveBindings(
			bindings,
			remoteProxyConnectionString,
			{ warn }
		);
		expect(result).toEqual(new Map([["HEALTHY", connectionString]]));
		expect(requests).toEqual(
			new Map([
				["HEALTHY", 1],
				["BROKEN", 3],
			])
		);
		expect(bindings).toEqual(originalBindings);
		expect(warn).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("BROKEN"));
		expect(warn.mock.calls.flat().join(" ")).not.toContain("edge-password");
	});

	it("retries a transient failure without warning", async ({ expect }) => {
		const warn = vi.fn();
		const result = await seedRemoteHyperdriveBindings(
			{ TRANSIENT: remoteBinding },
			remoteProxyConnectionString,
			{ warn }
		);
		expect(result).toEqual(new Map([["TRANSIENT", connectionString]]));
		expect(requests.get("TRANSIENT")).toBe(2);
		expect(warn).not.toHaveBeenCalled();
	});

	it("ignores local Hyperdrive bindings and other binding types", async ({
		expect,
	}) => {
		const result = await seedRemoteHyperdriveBindings(
			{
				LOCAL: { ...remoteBinding, remote: false },
				SERVICE: { type: "service", service: "worker", remote: true },
			},
			remoteProxyConnectionString
		);
		expect(result.size).toBe(0);
		expect(requests.size).toBe(0);
	});

	it("does not seed without a remote session or bindings", async ({
		expect,
	}) => {
		expect(
			await seedRemoteHyperdriveBindings({ HEALTHY: remoteBinding }, undefined)
		).toEqual(new Map());
		expect(
			await seedRemoteHyperdriveBindings(undefined, remoteProxyConnectionString)
		).toEqual(new Map());
		expect(requests.size).toBe(0);
	});
});
