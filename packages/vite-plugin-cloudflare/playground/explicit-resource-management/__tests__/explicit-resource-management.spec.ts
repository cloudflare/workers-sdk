import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "vitest";
import {
	getJsonResponse,
	isBuild,
	page,
	satisfiesMinimumViteVersion,
	testDir,
} from "../../__test-utils__";

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

// The Worker-scoped esbuild override on Vite 6 and 7 must not reach the client.
// Vite 8 has no such override, since the client keeps its own target. Also, the
// pinned Vite 8.1.5 (Rolldown 1.1.5) leaves `using` in client bundles at an
// explicit target with or without this plugin, so the assertion only holds on
// Vite 6 and 7.
test.runIf(isBuild && !satisfiesMinimumViteVersion("8.0.0"))(
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
