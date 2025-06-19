import { DurableObject } from "cloudflare:workers";
import {
	createWebSocketModuleRunnerTransport,
	ModuleRunner,
} from "vite/module-runner";
import { INIT_PATH, UNKNOWN_HOST, VITE_DEV_METADATA_HEADER } from "../shared";
import { stripInternalEnv } from "./env";
import type { WrapperEnv } from "./env";

let entryModule: any;

export class RunnerObject extends DurableObject<WrapperEnv> {
	#entryPath: string | undefined;
	#moduleRunner: ModuleRunner | undefined;

	override async fetch(request: Request) {
		const { pathname } = new URL(request.url);

		if (pathname !== INIT_PATH) {
			throw new Error(`RunnerObject received invalid pathname: ${pathname}`);
		}

		if (this.#moduleRunner) {
			throw new Error("Runner already initialized");
		}

		try {
			const viteDevMetadata = getViteDevMetadata(request);
			this.#entryPath = viteDevMetadata.entryPath;
			const { 0: client, 1: server } = new WebSocketPair();
			this.#moduleRunner = createModuleRunner(this.env, server);

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

	async importEntryModule() {
		if (!(this.#entryPath && this.#moduleRunner)) {
			throw new Error("Runner not initialized");
		}

		entryModule = await this.#moduleRunner.import(this.#entryPath);
	}
}

function createModuleRunner(
	env: WrapperEnv,
	webSocket: WebSocket
): ModuleRunner {
	const transport = createWebSocketModuleRunnerTransport({
		createConnection() {
			webSocket.accept();

			return webSocket;
		},
	});

	return new ModuleRunner(
		{
			sourcemapInterceptor: "prepareStackTrace",
			transport: {
				...transport,
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

export async function getWorkerEntryExport(
	env: WrapperEnv,
	entrypoint: string
) {
	const stub = env.__VITE_RUNNER_OBJECT__.get("singleton");
	await stub.importEntryModule();
	const entrypointValue =
		typeof entryModule === "object" &&
		entryModule !== null &&
		entrypoint in entryModule &&
		entryModule[entrypoint];

	if (!entrypointValue) {
		throw new Error(`${"TODO"} does not export a ${entrypoint} entrypoint.`);
	}

	return entrypointValue;
}
