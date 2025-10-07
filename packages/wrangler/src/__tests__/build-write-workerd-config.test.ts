import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("wrangler build --write-workerd-config", () => {
	it("writes a workerd capnp config to the specified path", async () => {
		runInTempDir();
		writeFileSync(
			join(process.cwd(), "wrangler.toml"),
			`name = "test-worker"\nmain = "index.js"\ncompatibility_date = "2024-01-01"\n`
		);
		writeFileSync(
			join(process.cwd(), "index.js"),
			`export default { fetch() { return new Response("ok"); } }`
		);

		await execa(
			"node",
			[
				join(__dirname, "..", "..", "bin", "wrangler.js"),
				"build",
				"--write-workerd-config",
				"out.capnp",
			],
			{ cwd: process.cwd() }
		);

		const outPath = join(process.cwd(), "out.capnp");
		expect(existsSync(outPath)).toBe(true);
		const buf = readFileSync(outPath);
		expect(buf.byteLength).toBeGreaterThan(0);
	});
});
