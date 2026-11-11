import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";

describe("pages functions build --watch (#2856)", () => {
	mockConsoleMethods();
	runInTempDir();

	it("rebuilds when a new file is added to the functions directory", async ({
		expect,
	}) => {
		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`export async function onRequest() { return new Response("hello"); }`
		);

		await runWrangler(
			`pages functions build --watch --outfile=out.js --output-routes-path=routes.json`
		);
		expect(readFileSync("routes.json", "utf8")).not.toContain("/bye");

		writeFileSync(
			"functions/bye.js",
			`export async function onRequest() { return new Response("bye"); }`
		);

		await vi.waitFor(
			() => {
				expect(readFileSync("routes.json", "utf8")).toContain("/bye");
			},
			{ timeout: 5000, interval: 100 }
		);
	});
});
