import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { getWorkerBundleDir } from "@cloudflare/build-output-utils";
import { createBuilder } from "vite";
import { test } from "vitest";

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

test("writes project-relative sources in the Worker's source map", async ({
	expect,
}) => {
	const root = fs.mkdtempSync(path.join(fixturesPath, "sourcemap-sources-"));
	fs.mkdirSync(path.join(root, "src"));
	fs.writeFileSync(
		path.join(root, "cloudflare.config.ts"),
		`export default {
			worker: {
				name: "sourcemap-sources",
				entrypoint: "./src/index.ts",
				compatibilityDate: "2024-12-30",
			},
		};
		`
	);
	fs.writeFileSync(
		path.join(root, "src", "index.ts"),
		`function explode(): never {
			throw new Error("boom");
		}

		export default {
			async fetch(): Promise<Response> {
				explode();
				return new Response("unreachable");
			},
		};
		`
	);

	try {
		const builder = await createBuilder({
			root,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});
		await builder.buildApp();

		const sourceMapPath = path.join(
			getWorkerBundleDir(root),
			"index.js.map"
		);
		const map = JSON.parse(
			fs.readFileSync(sourceMapPath, "utf8")
		) as { sources: string[] };

		// The Worker's output directory is nested deep inside the Build Output
		// (`.cloudflare/output/v0/workers/default/bundle/`), so sources written
		// relative to the source map show as many `../` segments in uploaded
		// stack traces. They must be relative to the project root instead.
		expect(map.sources).toContain("src/index.ts");
		for (const source of map.sources) {
			expect(source.startsWith("..")).toBe(false);
		}
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
