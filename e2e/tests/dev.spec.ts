import fs from "node:fs/promises";
import path from "node:path";
import { fetch } from "undici";
import {
	cleanupSpawnedProcesses,
	dedent,
	getTmp,
	readUntil,
	seed,
	spawn,
	isWin,
} from "../setup";

// `--experimental-local` tests will need to `npx-import` `@miniflare/tre`.
// This might take a while, as we install `better-sqlite3`.
jest.setTimeout(60_000);

afterAll(cleanupSpawnedProcesses);

type ReadyMatchGroups = { port: string };

const devTable: [command: string, readyRegExp: RegExp][] = [
	// TODO(soon): ["wrangler dev", ...],
	["wrangler dev --local", /\[mf:inf] Listening on .*:(?<port>\d+)/],
];
if (!isWin) {
	// `--experimental-local` currently requires either Docker or WSL to run on
	// Windows. These are difficult to get running in GitHub actions, and WSL 2's
	// networking for local services is exceptionally flaky. For now, we disable
	// `--experimental-local` E2E tests on Windows, but we'll re-enable these ASAP
	// once we have a native build.
	devTable.push([
		"wrangler dev --experimental-local",
		/\[mf:inf] (Updated and )?[Rr]eady on .*:(?<port>\d+)/,
	]);
}
describe.each(devTable)("%s", (commandStr, readyRegExp) => {
	const command = commandStr.split(" ");

	const formats = ["service-worker", "modules"] as const;
	test.each(formats)("%s", async (format) => {
		const cwd = getTmp();
		const files = {
			"wrangler.toml": dedent`
				compatibility_date = "2022-12-07"
				[vars]
				VAR = "thing"
			`,
			"src/value.ts": dedent`
				export const value: number = 1;
			`,
			"src/index.ts":
				format === "service-worker"
					? dedent`
							import { value } from "./value.ts";
							addEventListener("fetch", (event) => {
								event.respondWith(Response.json({ value, VAR }));
							});
						`
					: dedent`
							import { value } from "./value.ts";
							export default <ExportedHandler<{ VAR: string }>>{
								fetch(request, env, ctx) {
									return Response.json({ value, VAR: env.VAR });
								}
							}
						`,
		};
		await seed(cwd, files);
		const wrangler = await spawn(cwd, [...command, "src/index.ts", "--port=0"]);

		// Send HTTP request to dev server
		let match = await readUntil<ReadyMatchGroups>(wrangler.lines, readyRegExp);
		let res = await fetch(`http://127.0.0.1:${match.groups.port}`);
		expect(await res.json()).toStrictEqual({ value: 1, VAR: "thing" });

		// Update script, and check dev server reloaded
		const newValue = files["src/value.ts"].replace("= 1", "= 2");
		await fs.writeFile(path.resolve(cwd, "src/value.ts"), newValue);
		// TODO(fix): reuse port=0 port with --local too, maybe switch to Miniflare#setOptions() in Miniflare 2 too?
		match = await readUntil(wrangler.lines, readyRegExp);
		res = await fetch(`http://127.0.0.1:${match.groups.port}`);
		expect(await res.json()).toStrictEqual({ value: 2, VAR: "thing" });

		// Check graceful shutdown with `x` hotkey
		wrangler.process.write("x");
		const code = await wrangler.exitPromise;
		expect(code).toBe(0);
	});
});

// TODO(soon): local mode switcher
// TODO(soon): graceful shutdown with CTRL-C
// TODO(soon): multi-worker
// TODO(soon): publish

export {};
