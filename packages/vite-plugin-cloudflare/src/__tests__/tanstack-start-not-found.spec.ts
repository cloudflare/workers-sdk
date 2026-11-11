import { spawn, execSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, test } from "vitest";

// https://github.com/cloudflare/workers-sdk/issues/14917
//
// Creates a TanStack Start project that uses the (locally built) Cloudflare
// Vite plugin and runs its dev server.
const pluginPath = path.resolve(__dirname, "../..");

const files: Record<string, string> = {
	"package.json": JSON.stringify(
		{
			name: "tanstack-start-not-found",
			version: "0.0.0",
			private: true,
			type: "module",
			scripts: { dev: "vite dev" },
			dependencies: {
				"@tanstack/react-router": "1.170.16",
				"@tanstack/react-start": "1.168.26",
				react: "19.2.7",
				"react-dom": "19.2.7",
			},
			devDependencies: {
				"@cloudflare/vite-plugin": "link:" + pluginPath,
				"@vitejs/plugin-react": "^6.0.3",
				vite: "^8.0.0",
				cf: "latest",
			},
		},
		null,
		2
	),
	"tsconfig.json": JSON.stringify({
		compilerOptions: {
			target: "ES2022",
			module: "Preserve",
			moduleResolution: "Bundler",
			jsx: "react-jsx",
			strict: true,
			skipLibCheck: true,
			noEmit: true,
		},
		include: ["src", "vite.config.ts"],
	}),
	"cloudflare.config.ts": `
import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "tanstack-start-not-found",
		entrypoint: "./src/worker.ts",
		compatibilityDate: "2026-07-06",
		compatibilityFlags: ["nodejs_compat"],
	},
});
`,
	"vite.config.ts": `
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tanstackStart(),
		viteReact(),
	],
});
`,
	"src/worker.ts": `export { default } from "@tanstack/react-start/server-entry";\n`,
	"src/router.tsx": `
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	return createRouter({ routeTree, defaultPreload: "intent" });
}
`,
	"src/routes/__root.tsx": `
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createRootRoute({
	notFoundComponent: () => <p>Not found</p>,
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
`,
	"src/routes/index.tsx": `
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: () => <p>Home</p>,
});
`,
	"src/routes/item.$id.tsx": `
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/item/$id")({
	loader: async ({ params }) => {
		if (params.id === "missing") throw notFound();
		return { id: params.id };
	},
	component: ItemPage,
});

function ItemPage() {
	const { id } = Route.useLoaderData();
	return <p>Item {id}</p>;
}
`,
};


async function getFreePort() {
	return new Promise<number>((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, () => {
			const { port } = server.address() as net.AddressInfo;
			server.close(() => resolve(port));
		});
		server.on("error", reject);
	});
}

describe("TanStack Start notFound() thrown from a loader", () => {
	let projectPath: string;
	let proc: ChildProcess | undefined;

	beforeAll(async () => {
		projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "tss-not-found-"));
		for (const [name, content] of Object.entries(files)) {
			const file = path.join(projectPath, name);
			await fs.mkdir(path.dirname(file), { recursive: true });
			await fs.writeFile(file, content);
		}
		execSync("pnpm install --ignore-workspace", {
			cwd: projectPath,
			stdio: "pipe",
			env: { ...process.env, VITEST: undefined },
		});
	}, 300_000);

	afterAll(async () => {
		if (proc?.pid) {
			try {
				process.kill(-proc.pid, "SIGKILL");
			} catch {}
		}
		await fs.rm(projectPath, { recursive: true, force: true });
	});

	test(
		"later requests to the route don't hang when its first render was a notFound()",
		{ timeout: 240_000, retry: 0 },
		async ({ expect }) => {
			const port = await getFreePort();
			proc = spawn("pnpm", ["exec", "vite", "dev", "--port", String(port)], {
				cwd: projectPath,
				detached: true,
				stdio: "ignore",
				env: { ...process.env, VITEST: undefined },
			});
			const url = `http://localhost:${port}`;

			// Wait for the dev server to be ready
			let ready = false;
			for (let i = 0; i < 120 && !ready; i++) {
				try {
					await fetch(url + "/", { signal: AbortSignal.timeout(5_000) });
					ready = true;
				} catch {
					await new Promise((r) => setTimeout(r, 1_000));
				}
			}
			expect(ready).toBe(true);

			// The route's first request throws notFound() from its loader
			const missing = await fetch(url + "/item/missing", {
				signal: AbortSignal.timeout(30_000),
			});
			expect(missing.status).toBe(404);
			await missing.text();

			// A later, valid request to the same route must still render
			const exists = await fetch(url + "/item/exists", {
				signal: AbortSignal.timeout(20_000),
			});
			expect(exists.status).toBe(200);
			expect(await exists.text()).toContain("Item ");
		}
	);
});
