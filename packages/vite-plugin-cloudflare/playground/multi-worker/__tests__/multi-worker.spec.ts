import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { getJsonResponse, isBuild, rootDir } from "../../__test-utils__";

describe.runIf(isBuild)("output directories", () => {
	test("creates the correct output directories", () => {
		expect(fs.existsSync(path.join(rootDir, "dist", "worker_a"))).toBe(true);
		expect(fs.existsSync(path.join(rootDir, "dist", "worker_b"))).toBe(true);
	});

	test("does include unwanted files in deployment bundle", async () => {
		const output = execSync("pnpm deploy-a --dry-run", {
			cwd: rootDir,
			encoding: "utf8",
		});
		// There should be no additional modules, in particular ones in `.wrangler/tmp`.
		expect(output).not.toContain("Attaching additional modules");
	});
});

describe("multi-worker basic functionality", async () => {
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

	test("promise pipelining on default entrypoint", async () => {
		const result = await getJsonResponse("/rpc-method/promise-pipelining");
		expect(result).toEqual({ result: "You made it! 🎉" });
	});

	test("calls an RPC getter on another worker", async () => {
		const result = await getJsonResponse("/rpc-getter");
		expect(result).toEqual({ result: "Cloudflare" });
	});

	test("calls an RPC method on a named entrypoint", async () => {
		const result = await getJsonResponse("/rpc-named-entrypoint");
		expect(result).toEqual({ result: 20 });
	});

	test("promise pipelining on a named entrypoint", async () => {
		const result = await getJsonResponse(
			"/rpc-named-entrypoint/promise-pipelining"
		);
		expect(result).toEqual({ result: "You made it! 🚀" });
	});
});
