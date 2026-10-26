/**
 * Bindings and exports from a separate process: the child only gets the
 * JSON connection (URL, secret, binding list), not the Miniflare instance.
 */
import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, test } from "vitest";
import { createExplorerClient, createPreviewServer } from "../src";
import type { PreviewServer } from "../src";

const fixtureRoot = path.resolve(__dirname, "../fixture");
const childScript = path.resolve(__dirname, "child/connect.mjs");

describe("bindings from another process", () => {
	let server: PreviewServer;

	beforeAll(async () => {
		server = await createPreviewServer({ root: fixtureRoot });
	});

	afterAll(async () => {
		await server?.dispose();
	});

	test("KV, Durable Object RPC and entrypoint RPC", async ({ expect }) => {
		const connection = await server.getBindingsConnection();
		const { stdout } = await promisify(execFile)(process.execPath, [
			"--experimental-strip-types",
			"--no-warnings",
			childScript,
			JSON.stringify(connection),
		]);

		expect(JSON.parse(stdout)).toEqual({
			greeting: "hello",
			sum: 42,
			count: 1,
		});
		expect(
			await createExplorerClient(server.url)
				.worker()
				.kv("NOTES")
				.get("note:child")
		).toBe("written by another process");
	});
});
