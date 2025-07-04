import { DurableObject } from "cloudflare:workers";
import { ModuleRunner } from "vite/module-runner";
import { INIT_PATH, UNKNOWN_HOST } from "../shared";
import { stripInternalEnv } from "./env";
import type { WrapperEnv } from "./env";

let moduleRunner: ModuleRunner;

export class __VITE_RUNNER_OBJECT__ extends DurableObject<WrapperEnv> {
	#webSocket?: WebSocket;

	override async fetch(request: Request) {
		const { pathname } = new URL(request.url);

		if (pathname !== INIT_PATH) {
			throw new Error(
				`__VITE_RUNNER_OBJECT__ received invalid pathname: ${pathname}`
			);
		}

		if (moduleRunner) {
			throw new Error(`Module runner already initialized`);
		}

		const { 0: client, 1: server } = new WebSocketPair();
		server.accept();
		this.#webSocket = server;
		moduleRunner = await createModuleRunner(this.env, this.#webSocket);

		return new Response(null, { status: 101, webSocket: client });
	}
	send(data: string) {
		if (!this.#webSocket) {
			throw new Error(`Module runner WebSocket not initialized`);
		}

		this.#webSocket.send(data);
	}
}

async function createModuleRunner(env: WrapperEnv, webSocket: WebSocket) {
	return new ModuleRunner(
		{
			sourcemapInterceptor: "prepareStackTrace",
			transport: {
				connect({ onMessage }) {
					webSocket.addEventListener("message", async ({ data }) => {
						onMessage(JSON.parse(data.toString()));
					});

					onMessage({
						type: "custom",
						event: "vite:ws:connect",
						data: { webSocket },
					});
				},
				disconnect() {
					webSocket.close();
				},
				send(data) {
					const stub = env.__VITE_RUNNER_OBJECT__.get("singleton");
					stub.send(JSON.stringify(data));
				},
				async invoke(data) {
					const response = await env.__VITE_INVOKE_MODULE__.fetch(
						new Request(UNKNOWN_HOST, {
							method: "POST",
							body: JSON.stringify(data),
						})
					);
					const result = await response.json();

					return result as { result: any } | { error: any };
				},
			},
			hmr: true,
		},
		{
			async runInlinedModule(context, transformed, module) {
				const code = `"use strict";async (${Object.keys(context).join(",")})=>{${transformed}}`;

				try {
					const fn = env.__VITE_UNSAFE_EVAL__.eval(code, module.id);
					await fn(...Object.values(context));
					Object.freeze(context.__vite_ssr_exports__);
				} catch (error) {
					throw new Error(`Error running module "${module.id}"`);
				}
			},
			async runExternalModule(filepath) {
				if (filepath === "cloudflare:workers") {
					const originalCloudflareWorkersModule = await import(
						"cloudflare:workers"
					);

					return Object.seal({
						...originalCloudflareWorkersModule,
						env: stripInternalEnv(
							originalCloudflareWorkersModule.env as WrapperEnv
						),
					});
				}

				return import(filepath);
			},
		}
	);
}

export async function getWorkerEntryExport(
	workerEntryPath: string,
	exportName: string
) {
	const module = await moduleRunner.import(workerEntryPath);
	const exportValue =
		typeof module === "object" &&
		module !== null &&
		exportName in module &&
		module[exportName];

	if (!exportValue) {
		throw new Error(
			`"${workerEntryPath}" does not define a "${exportName}" export.`
		);
	}

	return exportValue;
}
