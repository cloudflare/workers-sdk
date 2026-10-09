import * as fs from "node:fs";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { flue, flueWorkerConfig } from "@flue/vite";
import { createBuilder } from "vite";
import { afterEach, test, vi } from "vitest";
import { cloudflare } from "../index";

afterEach(() => vi.unstubAllEnvs());

test("builds unchanged Flue with a Wrangler customizer and native configuration", async ({
	expect,
	onTestFinished,
}) => {
	const fixtures = path.resolve(__dirname, "fixtures", "flue");
	fs.mkdirSync(fixtures, { recursive: true });
	const root = fs.realpathSync(fs.mkdtempSync(path.join(fixtures, "case-")));
	onTestFinished(() => removeDirSync(root));
	vi.stubEnv("CLOUDFLARE_VITE_BUILD", "false");
	fs.mkdirSync(path.join(root, "src", "agents"), { recursive: true });
	fs.writeFileSync(
		path.join(root, "package.json"),
		JSON.stringify({ name: "flue-customizer-test", type: "module" })
	);
	fs.writeFileSync(
		path.join(root, "src", "app.ts"),
		'export default { fetch() { return new Response("hello"); } };'
	);
	fs.writeFileSync(
		path.join(root, "src", "agents", "echo.ts"),
		"'use agent';\nexport function Echo() { return 'Echo the message.'; }"
	);
	fs.writeFileSync(
		path.join(root, "cloudflare.config.ts"),
		[
			"import { defineConfig } from '@cloudflare/config';",
			"export default defineConfig({ worker: {",
			"name: 'flue-customizer-test', compatibilityDate: '2026-04-01',",
			"env: { MESSAGE: { type: 'text', value: 'hello' } },",
			"exports: { FlueEchoAgent: { type: 'durable-object', storage: 'sqlite' } },",
			"} });",
		].join("\n")
	);
	const fluePlugin = flue();
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: [
			fluePlugin,
			cloudflare({
				wranglerConfig: flueWorkerConfig(),
				remoteBindings: false,
				inspectorPort: false,
				persistState: false,
				types: { generate: false },
			}),
		],
	});
	await builder.buildApp();
	const output = JSON.parse(
		fs.readFileSync(
			path.join(
				root,
				".cloudflare/output/v0/workers/default/worker.config.json"
			),
			"utf8"
		)
	);

	expect(output).toMatchObject({
		compatibilityDate: "2026-04-01",
		compatibilityFlags: ["nodejs_compat"],
		env: {
			MESSAGE: { type: "text", value: "hello" },
			FLUE_ECHO_AGENT: {
				type: "durable-object",
				worker: "flue-customizer-test",
				exportName: "FlueEchoAgent",
			},
		},
		exports: { FlueEchoAgent: { type: "durable-object", storage: "sqlite" } },
		manifest: { mainModule: expect.any(String) },
	});
});
