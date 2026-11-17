import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer } from "vite";
import { test, vi } from "vitest";

const FIXTURES_ROOT = path.resolve(__dirname, "fixtures", "artifacts-local");

test("starts a Workflow from a local Artifacts event in Wrangler config", async ({
	expect,
	onTestFinished,
}) => {
	fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
	const root = fs.realpathSync(
		fs.mkdtempSync(path.join(FIXTURES_ROOT, "events-"))
	);
	onTestFinished(() => removeDirSync(root));
	fs.writeFileSync(
		path.join(root, "package.json"),
		JSON.stringify({ type: "module" })
	);
	fs.writeFileSync(
		path.join(root, "wrangler.json"),
		JSON.stringify({
			name: "vite-artifacts-events",
			main: "index.js",
			compatibility_date: "2026-09-03",
			artifacts: [{ binding: "REPOS", namespace: "examples", remote: false }],
			kv_namespaces: [{ binding: "EVENTS", id: "events" }],
			workflows: [
				{ binding: "ON_EVENT", name: "on-event", class_name: "OnEvent" },
			],
			triggers: {
				events: [
					{
						type: "cf.artifacts.repo.created",
						filter: { namespace: "examples" },
						targets: [{ type: "workflow", workflow_name: "on-event" }],
					},
				],
			},
		})
	);
	fs.writeFileSync(
		path.join(root, "index.js"),
		`
import { WorkflowEntrypoint } from "cloudflare:workers";
export class OnEvent extends WorkflowEntrypoint {
	async run(event, step) {
		await step.do("record", async () => {
			await this.env.EVENTS.put("event", JSON.stringify(event.payload));
			return "recorded";
		});
	}
}
export default {
	async fetch(request, env) {
		if (request.method === "POST") return Response.json(await env.REPOS.create("demo"));
		return new Response(await env.EVENTS.get("event"));
	}
};
`
	);
	const server = await createServer({
		root,
		configFile: false,
		logLevel: "silent",
		server: { port: 0 },
		plugins: [
			cloudflare({
				inspectorPort: false,
				persistState: false,
				remoteBindings: false,
			}),
		],
	});
	try {
		await server.listen();
		const url = server.resolvedUrls?.local[0];
		assert(url, "Expected the Vite server URL");
		expect((await fetch(url, { method: "POST" })).ok).toBe(true);
		await vi.waitFor(
			async () => {
				const message = await (await fetch(url)).json();
				expect(message).toMatchObject({
					type: "cf.artifacts.repo.created",
					source: { namespace: "examples", repoName: "demo" },
				});
			},
			{ timeout: 10_000 }
		);
	} finally {
		await server.close();
	}
});
