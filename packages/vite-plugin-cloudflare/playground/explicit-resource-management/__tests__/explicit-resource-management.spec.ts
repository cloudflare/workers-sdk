import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "vitest";
import { getJsonResponse, isBuild, page, rootDir } from "../../__test-utils__";

function getWorkerOutput() {
	const workerDir = path.join(rootDir, ".cloudflare/output/v0/workers/default");
	const config = JSON.parse(
		fs.readFileSync(path.join(workerDir, "worker.config.json"), "utf-8")
	) as { manifest: { mainModule: string } };

	return fs.readFileSync(
		path.join(workerDir, "bundle", config.manifest.mainModule),
		"utf-8"
	);
}

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
		const output = getWorkerOutput();
		expect(output).toMatch(/\bawait using [\w$]+ =/);
		expect(output).toMatch(/\busing [\w$]+ =/);
		expect(output).not.toMatch(/__using|_usingCtx/);
	}
);

test.runIf(isBuild)(
	"lowers using declarations in the client build",
	async ({ expect }) => {
		const clientDir = path.join(
			rootDir,
			".cloudflare/output/v0/workers/default/assets"
		);
		const html = fs.readFileSync(path.join(clientDir, "index.html"), "utf-8");
		const entry = html.match(/src="\/(assets\/[^"]+\.js)"/)?.[1];
		assert(entry, "No script entry in the client Build Output");
		const output = fs.readFileSync(path.join(clientDir, entry), "utf-8");
		expect(output).not.toMatch(/\busing [\w$]+\s*=/);
	}
);
