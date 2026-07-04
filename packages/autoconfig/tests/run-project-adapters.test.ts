import { existsSync, readFileSync } from "node:fs";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { getDetailsForAutoConfig } from "../src/details";
import { runAutoConfig } from "../src/run";
import { createMockContext } from "./helpers/mock-context";
import type { AutoConfigContext } from "../src/context";
import type { MockInstance } from "vitest";

describe("autoconfig run - project adapters", () => {
	runInTempDir();
	mockConsoleMethods();

	let context: AutoConfigContext;
	let packageSpies: MockInstance[] = [];

	beforeEach(() => {
		context = createMockContext();
		packageSpies = [
			vi.spyOn(cliPackages, "installWrangler").mockResolvedValue(),
			vi.spyOn(cliPackages, "installPackages").mockResolvedValue(),
		];
	});

	afterEach(() => {
		for (const spy of packageSpies) {
			spy.mockRestore();
		}
	});

	it("writes a Worker wrapper, wrangler config, and scripts for an Express server", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				name: "express-example",
				dependencies: { express: "5.1.0" },
			}),
			"server.js": `
				import express from "express";
				const app = express();
				const PORT = process.env.PORT ?? 8787;
				app.use(express.static("public"));
				app.get("/", (_req, res) => res.send("ok"));
				app.listen(PORT);
			`,
		});

		const details = await getDetailsForAutoConfig({ context });
		const summary = await runAutoConfig(details, {
			context,
			skipConfirmations: true,
			runBuild: false,
			enableWranglerInstallation: false,
		});

		expect(summary).toMatchObject({
			adapterId: "express-node-http-server",
			projectKind: "node-http-server",
			wranglerInstall: true,
			scripts: {
				deploy: "wrangler deploy",
				preview: "wrangler dev",
			},
			summaryFields: {
				entrypoint: "server.js",
				generatedEntrypoint: "src/worker.js",
				port: 8787,
			},
		});
		expect(summary.warnings).toContain(
			"express.static() was detected. Static assets are not migrated automatically; configure Workers Static Assets separately if needed."
		);

		const worker = readFileSync("src/worker.js", "utf8");
		expect(worker).toContain(
			'import { httpServerHandler } from "cloudflare:node";'
		);
		expect(worker).toContain('await import("../server.js");');
		expect(worker).toContain("process.env.PORT ??= String(port);");
		expect(worker).toContain("export default httpServerHandler({ port });");

		expect(JSON.parse(readFileSync("wrangler.jsonc", "utf8"))).toMatchObject({
			name: "express-example",
			main: "src/worker.js",
			compatibility_flags: ["nodejs_compat"],
			observability: { enabled: true },
		});
		expect(JSON.parse(readFileSync("package.json", "utf8"))).toMatchObject({
			scripts: {
				deploy: "wrangler deploy",
				preview: "wrangler dev",
			},
		});
		expect(cliPackages.installWrangler).not.toHaveBeenCalled();
		expect(cliPackages.installPackages).not.toHaveBeenCalled();
	});

	it("generates a TypeScript wrapper for an exported Express app", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				name: "express-ts-example",
				dependencies: { express: "5.1.0" },
			}),
			"tsconfig.json": JSON.stringify({ compilerOptions: {} }),
			"src/index.ts": `
				import express from "express";
				const app = express();
				export default app;
			`,
		});

		const details = await getDetailsForAutoConfig({ context });
		const summary = await runAutoConfig(details, {
			context,
			skipConfirmations: true,
			runBuild: false,
			enableWranglerInstallation: false,
		});

		expect(summary).toMatchObject({
			adapterId: "express-node-http-server",
			scripts: {
				"cf-typegen": "wrangler types",
				deploy: "wrangler deploy",
				preview: "wrangler dev",
			},
			summaryFields: {
				entrypoint: "src/index.ts",
				generatedEntrypoint: "src/worker.ts",
				port: 3000,
			},
		});

		const worker = readFileSync("src/worker.ts", "utf8");
		expect(worker).toContain('import app from "./index.ts";');
		expect(worker).toContain("const port: number = 3000;");
		expect(worker).toContain("app.listen(port);");
		expect(JSON.parse(readFileSync("wrangler.jsonc", "utf8"))).toMatchObject({
			main: "src/worker.ts",
		});
	});

	it("refuses to overwrite an existing generated adapter entrypoint", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { express: "5.1.0" } }),
			"index.js": `
				const express = require("express");
				const app = express();
				app.listen(3000);
			`,
			"src/worker.js": "export default {};\n",
		});

		const details = await getDetailsForAutoConfig({ context });

		await expect(
			runAutoConfig(details, {
				context,
				skipConfirmations: true,
				runBuild: false,
				enableWranglerInstallation: false,
			})
		).rejects.toThrow("Refusing to overwrite generated file src/worker.js");
		expect(readFileSync("src/worker.js", "utf8")).toBe("export default {};\n");
		expect(existsSync("wrangler.jsonc")).toBe(false);
	});

	it("writes singleton Container config, worker code, scripts, and dependency install plan", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ name: "container-example" }),
			"tsconfig.json": JSON.stringify({ compilerOptions: {} }),
			Dockerfile: "FROM node:22\nENV PORT=9090\n",
		});

		const details = await getDetailsForAutoConfig({
			context,
			deployIntent: {
				trigger: "setup",
				containersAutoConfig: true,
			},
		});
		const summary = await runAutoConfig(details, {
			context,
			skipConfirmations: true,
			runBuild: false,
			enableWranglerInstallation: false,
		});

		expect(summary).toMatchObject({
			adapterId: "dockerfile-container",
			projectKind: "container-image",
			scripts: {
				"cf-typegen": "wrangler types",
				deploy: "wrangler deploy",
				preview: "wrangler dev",
			},
			summaryFields: {
				dockerfile: "Dockerfile",
				generatedEntrypoint: "src/worker.ts",
				maxInstances: 1,
				port: 9090,
				routing: "singleton",
			},
		});
		expect(summary.warnings).toEqual(
			expect.arrayContaining([
				"Docker must be installed and running for local Dockerfile builds.",
				"Containers require the Workers Paid plan.",
			])
		);
		expect(cliPackages.installPackages).toHaveBeenCalledWith(
			"npm",
			["@cloudflare/containers"],
			{ dev: false, isWorkspaceRoot: false }
		);

		const worker = readFileSync("src/worker.ts", "utf8");
		expect(worker).toContain(
			'import { Container, getContainer } from "@cloudflare/containers";'
		);
		expect(worker).toContain("export class AppContainer extends Container");
		expect(worker).toContain("defaultPort = 9090;");
		expect(worker).toContain('PORT: "9090"');
		expect(worker).toContain("getContainer(env.APP_CONTAINER)");

		expect(JSON.parse(readFileSync("wrangler.jsonc", "utf8"))).toMatchObject({
			name: "container-example",
			main: "src/worker.ts",
			containers: [
				{
					name: "container-example",
					class_name: "AppContainer",
					image: "./Dockerfile",
					max_instances: 1,
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "APP_CONTAINER",
						class_name: "AppContainer",
					},
				],
			},
			migrations: [
				{
					tag: "v1",
					new_sqlite_classes: ["AppContainer"],
				},
			],
		});
	});
});
