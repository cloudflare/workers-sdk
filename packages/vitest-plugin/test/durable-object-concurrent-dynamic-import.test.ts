import childProcess from "node:child_process";
import { stripAnsi } from "miniflare";
import dedent from "ts-dedent";
import { version } from "../package.json";
import { test } from "./helpers";

// Regression test for https://github.com/cloudflare/workers-sdk/issues/16850
//
// Under Vitest 5.1, when several Durable Objects import a module on demand at
// about the same time (`await import("./a")`, where `./a` imports `./b`), every
// object but the first gets an unhandled rejection: "Cannot perform I/O on
// behalf of a different Durable Object" (I/O type: Lock&). Vitest 5.0.x
// rarely shows it, so this test installs Vitest 5.1 in its own project. The
// reporter found each of these needed to trigger it: a `setupFiles` entry, a
// large package (`@sentry/cloudflare`) evaluated by the test file before the
// objects, a call to another object in flight when the import starts, and an
// imported module that imports another one.
const reproVitestVersion = "5.1.0";

const ROUNDS = ["r1", "r2", "r3", "r4"];

function run(command: string, cwd: string) {
	return new Promise<{ exitCode: number; output: string }>((resolve) => {
		// eslint-disable-next-line workers-sdk/no-unsafe-command-execution -- test helper, fixed commands
		childProcess.exec(
			command,
			{
				cwd,
				env: {
					...process.env,
					CI: undefined,
					GITHUB_ACTIONS: undefined,
					NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"]
						.filter(Boolean)
						.join(" "),
				},
				maxBuffer: 64 * 1024 * 1024,
			},
			(error, stdout, stderr) => {
				resolve({
					exitCode: error
						? typeof error.code === "number"
							? error.code
							: 1
						: 0,
					output: stripAnsi(`${stdout}\n${stderr}`),
				});
			}
		);
	});
}

test(
	"Durable Objects importing a module on demand at the same time don't fail with cross-object I/O errors",
	{ timeout: 300_000 },
	async ({ expect, seed, tmpPath }) => {
		const modules: Record<string, string> = {};
		for (let i = 1; i <= ROUNDS.length; i++) {
			modules[`a${i}.ts`] = dedent`
				import { b } from "./b${i}";

				export const a = b + 1;
			`;
			modules[`b${i}.ts`] = dedent`
				export const b = 41;
			`;
		}

		await seed({
			"package.json": JSON.stringify({
				name: "durable-object-concurrent-dynamic-import",
				private: true,
				type: "module",
				devDependencies: {
					"@cloudflare/vitest-plugin": version,
					"@sentry/cloudflare": "11.8.0",
					vitest: reproVitestVersion,
				},
			}),
			// Its own workspace, so it doesn't share the pool installation's Vitest
			"pnpm-workspace.yaml": [
				"packages:",
				'  - "."',
				"allowBuilds:",
				"  esbuild: true",
				"  workerd: true",
				"",
			].join("\n"),
			"wrangler.jsonc": JSON.stringify({
				name: "repro",
				main: "index.ts",
				compatibility_date: "2026-10-06",
				compatibility_flags: ["nodejs_compat"],
				durable_objects: {
					bindings: [{ name: "OBJECT", class_name: "Room" }],
				},
				migrations: [{ tag: "v1", new_sqlite_classes: ["Room"] }],
			}),
			"vitest.config.ts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-plugin";
				import { defineConfig } from "vitest/config";

				export default defineConfig({
					plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
					test: { setupFiles: ["./setup.ts"], testTimeout: 90_000 },
				});
			`,
			"setup.ts": dedent`
				// Any setup file.
				export {};
			`,
			"index.ts": dedent`
				import { DurableObject } from "cloudflare:workers";

				type Env = { OBJECT: DurableObjectNamespace<Room> };

				declare global {
					// Shared by the isolate: the test reads it without calling the objects.
					var loaded: string[];
				}
				globalThis.loaded ??= [];

				const IMPORTS: Record<string, () => Promise<unknown>> = {
					r1: () => import("./a1"),
					r2: () => import("./a2"),
					r3: () => import("./a3"),
					r4: () => import("./a4"),
				};

				export class Room extends DurableObject<Env> {
					async fetch(): Promise<Response> {
						const [client, server] = Object.values(new WebSocketPair());
						this.ctx.acceptWebSocket(server);
						return new Response(null, { status: 101, webSocket: client });
					}

					async webSocketMessage(ws: WebSocket): Promise<void> {
						// Calls another object, answers, then imports \`./aN\` (which imports
						// \`./bN\`) on demand: one pair of modules per round of objects.
						this.ctx.waitUntil(this.env.OBJECT.get(this.env.OBJECT.idFromName("other")).ping());
						ws.send("received");
						const name = this.ctx.id.name ?? "";
						this.ctx.waitUntil(IMPORTS[name.slice(0, 2)]?.().then(() => void globalThis.loaded.push(name)));
					}

					webSocketClose(ws: WebSocket): void {
						ws.close(1000, "closed");
					}

					async ping(): Promise<void> {}
				}

				export default {
					fetch(request, env) {
						const name = new URL(request.url).pathname.slice(1);
						return env.OBJECT.get(env.OBJECT.idFromName(name)).fetch(request);
					},
				} satisfies ExportedHandler<Env>;
			`,
			"index.test.ts": dedent`
				import { exports } from "cloudflare:workers";
				import { beforeAll, expect, it, vi } from "vitest";

				// A package of @sentry/cloudflare's size, evaluated before the objects.
				beforeAll(() => import("@sentry/cloudflare"), 60_000);

				const NAMES = ${JSON.stringify(ROUNDS)}.flatMap((round) =>
					Array.from({ length: 10 }, (_, i) => \`\${round}-o\${i}\`)
				);

				it.each(NAMES)("object %s answers a message", async (name) => {
					const response = await exports.default.fetch(\`http://example.com/\${name}\`, {
						headers: { Upgrade: "websocket" },
					});
					const socket = response.webSocket;
					if (!socket) throw new Error("No socket");
					socket.accept();
					const answered = new Promise((resolve) =>
						socket.addEventListener("message", resolve, { once: true })
					);
					socket.send("hello");
					await answered;
					socket.close(1000);
				});

				it("every object has imported its module", async () => {
					await vi.waitFor(() =>
						expect(globalThis.loaded.toSorted()).toEqual(NAMES.toSorted())
					);
				});
			`,
			...modules,
		});

		const install = await run("pnpm install", tmpPath);
		expect(install.exitCode, install.output).toBe(0);

		const result = await run(
			`pnpm exec vitest run --root="${tmpPath}"`,
			tmpPath
		);
		expect(result.output).toMatch("41 passed");
		expect(result.output).not.toMatch(
			"Cannot perform I/O on behalf of a different Durable Object"
		);
		expect(result.exitCode).toBe(0);
	}
);
