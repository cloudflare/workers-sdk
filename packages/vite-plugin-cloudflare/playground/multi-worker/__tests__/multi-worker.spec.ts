import * as fs from "node:fs";
import { getWorkerBundleDir } from "@cloudflare/build-output-utils";
import { describe, test } from "vitest";
import { getJsonResponse, isBuild, rootDir } from "../../__test-utils__";

describe.runIf(isBuild)("output directories", () => {
	test("creates the correct output directories", ({ expect }) => {
		expect(fs.existsSync(getWorkerBundleDir(rootDir))).toBe(true);
		expect(fs.existsSync(getWorkerBundleDir(rootDir, "auxiliary-worker"))).toBe(
			true
		);
	});
});

describe("multi-worker basic functionality", async () => {
	test("entry worker returns a response", async ({ expect }) => {
		const result = await getJsonResponse();
		expect(result).toEqual({ name: "Worker A" });
	});
});

describe("multi-worker service bindings", async () => {
	test("returns a response from another worker", async ({ expect }) => {
		const result = await getJsonResponse("/fetch");
		expect(result).toEqual({ result: { name: "Worker B" } });
	});

	test("calls an RPC method on another worker", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-method");
		expect(result).toEqual({ result: 9 });
	});

	test("promise pipelining on default entrypoint", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-method/promise-pipelining");
		expect(result).toEqual({ result: "You made it! 🎉" });
	});

	test("calls an RPC getter on another worker", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-getter");
		expect(result).toEqual({ result: "Cloudflare" });
	});

	test("calls an RPC method on a named entrypoint", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-named-entrypoint");
		expect(result).toEqual({ result: 20 });
	});

	test("promise pipelining on a named entrypoint", async ({ expect }) => {
		const result = await getJsonResponse(
			"/rpc-named-entrypoint/promise-pipelining"
		);
		expect(result).toEqual({ result: "You made it! 🚀" });
	});
});
