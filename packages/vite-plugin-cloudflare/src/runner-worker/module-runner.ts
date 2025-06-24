import { DurableObject } from "cloudflare:workers";
import {
	createWebSocketModuleRunnerTransport,
	ModuleRunner,
} from "vite/module-runner";
import { INIT_PATH, UNKNOWN_HOST, VITE_DEV_METADATA_HEADER } from "../shared";
import { stripInternalEnv } from "./env";
import type { WrapperEnv } from "./env";

let moduleRunner: ModuleRunner | undefined;
let entryPath: string | undefined;

export class RunnerObject extends DurableObject<WrapperEnv> {
	#webSocket: WebSocket | undefined;

	override async fetch(request: Request) {
		const { pathname } = new URL(request.url);

		if (pathname !== INIT_PATH) {
			throw new Error(`RunnerObject received invalid pathname: ${pathname}`);
		}

		if (moduleRunner) {
			throw new Error("Runner already initialized");
		}

		try {
			const viteDevMetadata = getViteDevMetadata(request);
			entryPath = viteDevMetadata.entryPath;
			const { 0: client, 1: server } = new WebSocketPair();
			server.accept();
			this.#webSocket = server;
			moduleRunner = createModuleRunner(this.env, this.#webSocket);

			return new Response(null, {
				status: 101,
				webSocket: client,
			});
		} catch (e) {
			return new Response(e instanceof Error ? e.message : JSON.stringify(e), {
				status: 500,
			});
		}
	}

	send(data: string) {
		if (!this.#webSocket) {
			throw Error("No WebSocket");
		}

		this.#webSocket.send(data);
	}
}

function createModuleRunner(
	env: WrapperEnv,
	webSocket: WebSocket
): ModuleRunner {
	return new ModuleRunner(
		{
			sourcemapInterceptor: "prepareStackTrace",
			transport: {
				connect({ onMessage }) {
					webSocket.addEventListener("message", async ({ data }) => {
						onMessage(JSON.parse(data as any));
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

					if (!response.ok) {
						throw new Error(await response.text());
					}

					const result = await response.json();

					return result as { result: any } | { error: any };
				},
			},
			hmr: true,
		},
		{
			async runInlinedModule(context, transformed, module) {
				const codeDefinition = `'use strict';async (${Object.keys(context).join(
					","
				)})=>{{`;
				const code = `${codeDefinition}${transformed}\n}}`;
				try {
					const fn = env.__VITE_UNSAFE_EVAL__.eval(code, module.id);
					await fn(...Object.values(context));
					Object.freeze(context.__vite_ssr_exports__);
				} catch (e) {
					console.error("error running", module.id);
					console.error(e instanceof Error ? e.stack : e);
					throw e;
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

				filepath = filepath.replace(/^file:\/\//, "");
				return import(filepath);
			},
		}
	);
}

function getViteDevMetadata(request: Request) {
	const viteDevMetadataHeader = request.headers.get(VITE_DEV_METADATA_HEADER);
	if (viteDevMetadataHeader === null) {
		throw new Error(
			"Unexpected internal error, vite dev metadata header not set"
		);
	}

	let parsedViteDevMetadataHeader: Record<string, string>;
	try {
		parsedViteDevMetadataHeader = JSON.parse(viteDevMetadataHeader);
	} catch {
		throw new Error(
			`Unexpected internal error, vite dev metadata header JSON parsing failed, value = ${viteDevMetadataHeader}`
		);
	}

	const { entryPath } = parsedViteDevMetadataHeader;

	if (entryPath === undefined) {
		throw new Error(
			"Unexpected internal error, vite dev metadata header doesn't contain an entryPath value"
		);
	}

	return { entryPath };
}

export async function getWorkerEntryExport(entrypoint: string) {
	if (!(moduleRunner && entryPath)) {
		throw new Error("Module runner not initialized");
	}

	const entryModule = await moduleRunner.import(entryPath);
	const entrypointValue =
		typeof entryModule === "object" &&
		entryModule !== null &&
		entrypoint in entryModule &&
		entryModule[entrypoint];

	if (!entrypointValue) {
		throw new Error(`${entryPath} does not export a ${entrypoint} entrypoint.`);
	}

	return entrypointValue;
}
