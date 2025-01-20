import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
	getJsonResponse,
	isBuild,
	rootDir,
	serverLogs,
} from "../../__test-utils__";

describe.runIf(isBuild)("output directories", () => {
	test("creates the correct output directories", () => {
		expect(fs.existsSync(path.join(rootDir, "dist", "worker_a"))).toBe(true);
		expect(fs.existsSync(path.join(rootDir, "dist", "worker_b"))).toBe(true);
	});
});

describe("multi-worker basic functionality", async () => {
	test("worker configs warnings are not present in the terminal", async () => {
		expect(serverLogs.warns).toEqual([]);
	});

	test("entry worker returns a response", async () => {
		const result = await getJsonResponse();
		expect(result).toEqual({ name: "Worker A" });
	});
});

describe("multi-worker service bindings", async () => {
	test("returns a response from another worker", async () => {
		const result = await getJsonResponse("/fetch");
		expect(result).toEqual({ result: { name: "Worker B" } });
	});

	test("calls an RPC method on another worker", async () => {
		const result = await getJsonResponse("/rpc-method");
		expect(result).toEqual({ result: 9 });
	});

	test("calls an RPC getter on another worker", async () => {
		const result = await getJsonResponse("/rpc-getter");
		expect(result).toEqual({ result: "Cloudflare" });
	});

	test("calls an RPC method on a named entrypoint", async () => {
		const result = await getJsonResponse("/rpc-named-entrypoint");
		expect(result).toEqual({ result: 20 });
	});
});
