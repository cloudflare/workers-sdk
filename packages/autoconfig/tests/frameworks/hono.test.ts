import { readFileSync } from "node:fs";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { Hono } from "../../src/frameworks/hono";
import { installCloudflareVitePlugin } from "../../src/frameworks/utils/vite-plugin";
import { createMockContext } from "../helpers/mock-context";

vi.mock("../../src/frameworks/utils/vite-plugin", () => ({
	installCloudflareVitePlugin: vi.fn(),
}));

const HONO_APP = `import { Hono } from "hono";

const app = new Hono();

export default app;
`;

function configure(options: { dryRun?: boolean; main?: string } = {}) {
	return new Hono({ id: "hono", name: "Hono" }).configure({
		target: "cf",
		projectPath: process.cwd(),
		outputDir: "dist",
		workerName: "my-hono-app",
		dryRun: options.dryRun ?? false,
		packageManager: NpmPackageManager,
		isWorkspaceRoot: false,
		context: createMockContext(),
		wranglerConfig:
			options.main === undefined ? undefined : { main: options.main },
	});
}

describe("Hono", () => {
	runInTempDir();

	beforeEach(() => {
		vi.spyOn(cliPackages, "installPackages").mockImplementation(async () => {});
	});

	it("sets up a Hono app without Vite to build with Vite", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { hono: "^4.0.0" } }),
			"src/index.ts": HONO_APP,
			"tsconfig.json": "{}",
		});

		await expect(configure()).resolves.toEqual({
			buildTool: "vite",
			workerConfig: { entrypoint: "./src/index.ts" },
		});
		expect(cliPackages.installPackages).toHaveBeenCalledWith(
			"npm",
			["vite"],
			expect.objectContaining({ dev: true })
		);
		expect(installCloudflareVitePlugin).toHaveBeenCalled();
		expect(readFileSync("vite.config.ts", "utf8")).toContain(
			"plugins: [cloudflare()]"
		);
	});

	it("replaces Hono's Vite plugins with the Cloudflare plugin, keeping their entry", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				type: "module",
				devDependencies: { vite: "^8.0.0" },
			}),
			"src/app.tsx": `import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.html(<h1>Hello Hono!</h1>));

export default app;
`,
			"vite.config.ts": `import viteBuild from "@hono/vite-build/node";
import honoDevServer from "@hono/vite-dev-server";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [viteBuild({ entry: "./src/app.tsx" }), honoDevServer({ entry: "src/app.tsx" })],
});
`,
		});

		await expect(configure()).resolves.toEqual({
			buildTool: "vite",
			workerConfig: { entrypoint: "./src/app.tsx" },
		});
		expect(cliPackages.installPackages).not.toHaveBeenCalled();
		const viteConfig = readFileSync("vite.config.ts", "utf8");
		expect(viteConfig).toContain("plugins: [cloudflare()]");
		expect(viteConfig).not.toContain("@hono/");
	});

	it("uses the Worker entry point from the Wrangler config", async ({
		expect,
	}) => {
		await seed({ "src/index.ts": HONO_APP, "src/worker.ts": HONO_APP });

		await expect(
			configure({ dryRun: true, main: "src/worker.ts" })
		).resolves.toMatchObject({
			workerConfig: { entrypoint: "./src/worker.ts" },
		});
	});

	it("refuses an entry that doesn't export the app", async ({ expect }) => {
		await seed({
			"src/index.ts": `import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

serve({ fetch: app.fetch, port: 3000 });
`,
		});

		await expect(configure({ dryRun: true })).rejects.toThrow(
			"`src/index.ts` doesn't export the Hono app, so it can't run as a Worker."
		);
	});

	it("refuses a build that combines several entry files", async ({
		expect,
	}) => {
		await seed({
			"src/cron.ts": "export default { scheduled() {} };\n",
			"src/index.ts": HONO_APP,
			"vite.config.ts": `import build from "@hono/vite-build/cloudflare-workers";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [build({ entry: ["./src/index.ts", "src/cron.ts"] })],
});
`,
		});

		await expect(configure({ dryRun: true })).rejects.toThrow(
			"cf can't set up a Hono build that combines several entry files automatically yet: `src/index.ts`, `src/cron.ts`."
		);
	});

	it("refuses HonoX", async ({ expect }) => {
		await seed({
			"app/server.ts": HONO_APP,
			"package.json": JSON.stringify({ dependencies: { honox: "0.1.61" } }),
		});

		await expect(configure({ dryRun: true })).rejects.toThrow(
			"cf can't set up HonoX projects automatically yet."
		);
	});
});
