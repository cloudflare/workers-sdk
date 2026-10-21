import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "vitest";
import { getJsonResponse, isBuild, page, testDir } from "../../__test-utils__";

test("disposes resources in reverse order in the Worker", async ({
	expect,
}) => {
	expect(await getJsonResponse("/api")).toEqual(["socket", "session"]);
});

test("disposes resources in the client", async ({ expect }) => {
	expect(await page.textContent("h1")).toBe("resource");
});

test.runIf(isBuild)(
	"keeps using declarations in the Worker build",
	async ({ expect }) => {
		const output = fs.readFileSync(
			path.join(testDir, "dist", "worker", "index.js"),
			"utf-8"
		);
		expect(output).toMatch(/\bawait using [\w$]+ =/);
		expect(output).toMatch(/\busing [\w$]+ =/);
		expect(output).not.toMatch(/__using|_usingCtx/);
	}
);

test.runIf(isBuild)(
	"lowers using declarations in the client build",
	async ({ expect }) => {
		const clientDir = path.join(testDir, "dist", "client");
		const html = fs.readFileSync(path.join(clientDir, "index.html"), "utf-8");
		const entry = html.match(/src="\/(assets\/[^"]+\.js)"/)?.[1];
		assert(entry, "No script entry in dist/client/index.html");
		const output = fs.readFileSync(path.join(clientDir, entry), "utf-8");
		expect(output).not.toMatch(/\busing [\w$]+\s*=/);
	}
);
