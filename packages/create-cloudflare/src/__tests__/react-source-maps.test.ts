import {
	copyFileSync,
	mkdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { createBuilder } from "vite";
import { describe, test, vi } from "vitest";
import reactTemplate from "../../templates/react/workers/c3";
import { createTestArgs, createTestContext } from "./helpers";

vi.mock("helpers/packages", () => ({ installPackages: vi.fn() }));

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("React Worker starter source maps", () => {
	runInTempDir();

	test.for(["js", "ts"] as const)(
		"builds external Worker maps without browser maps for %s",
		async (lang, { expect }) => {
			symlinkSync(
				resolve(packageRoot, "node_modules"),
				"node_modules",
				"junction"
			);
			mkdirSync("worker");
			writeFileSync(
				`worker/index.${lang}`,
				'export default { fetch() { return new Response("hello"); } };'
			);
			writeFileSync(
				"index.html",
				'<script type="module" src="/client.js"></script>'
			);
			writeFileSync("client.js", 'console.log("hello from the browser");');
			writeFileSync(
				"wrangler.jsonc",
				JSON.stringify({
					name: "source-map-starter",
					main: `worker/index.${lang}`,
					compatibility_date: "2026-10-01",
					upload_source_maps: true,
				})
			);
			writeFileSync(
				`vite.config.${lang}`,
				`import { defineConfig } from "vite";
const react = () => ({ name: "react" });
export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false },
});`
			);
			writeFileSync("package.json", JSON.stringify({ type: "module" }));
			if (lang === "ts") {
				writeFileSync("tsconfig.json", JSON.stringify({ references: [] }));
				writeFileSync("tsconfig.node.json", "{}");
				copyFileSync(
					resolve(
						packageRoot,
						"templates/react/workers/ts/tsconfig.worker.json"
					),
					"tsconfig.worker.json"
				);
			}

			const ctx = createTestContext(
				"source-map-starter",
				createTestArgs({ lang })
			);
			ctx.project.path = process.cwd();
			await reactTemplate.configure?.(ctx);
			const builder = await createBuilder({ logLevel: "silent" });
			expect(builder.environments.worker.config.build.sourcemap).toBe(true);
			expect(builder.environments.client.config.build.sourcemap).toBe(false);
			await builder.buildApp();

			const workerCode = readFileSync("dist/worker/index.js", "utf8");
			expect(workerCode).toContain("//# sourceMappingURL=index.js.map");
			const map = JSON.parse(readFileSync("dist/worker/index.js.map", "utf8"));
			expect(
				map.sources.some((source: string) =>
					source.endsWith(`worker/index.${lang}`)
				)
			).toBe(true);
			expect(map.mappings.length).toBeGreaterThan(0);
		}
	);
});
