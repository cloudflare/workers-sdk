import {
	createWebSocketModuleRunnerTransport,
	ModuleRunner,
} from "vite/module-runner";
import { UNKNOWN_HOST } from "../shared";
import type { WrapperEnv } from "./env";

let moduleRunner: ModuleRunner;

export async function createModuleRunner(
	env: WrapperEnv,
	webSocket: WebSocket
) {
	if (moduleRunner) {
		throw new Error("Runner already initialized");
	}

	const transport = createWebSocketModuleRunnerTransport({
		createConnection() {
			webSocket.accept();

			return webSocket;
		},
	});

	moduleRunner = new ModuleRunner(
		{
			root: env.__VITE_ROOT__,
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
				if (
					module.file.includes("/node_modules") &&
					!module.file.includes("/node_modules/.vite")
				) {
					throw new Error(
						`[Error] Trying to import non-prebundled module (only prebundled modules are allowed): ${module.id}` +
							"\n\n(have you excluded the module via `optimizeDeps.exclude`?)"
					);
				}
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
				if (
					filepath.includes("/node_modules") &&
					!filepath.includes("/node_modules/.vite")
				) {
					throw new Error(
						`[Error] Trying to import non-prebundled module (only prebundled modules are allowed): ${filepath}` +
							"\n\n(have you externalized the module via `resolve.external`?)"
					);
				}
				filepath = filepath.replace(/^file:\/\//, "");
				return import(filepath);
			},
		}
	);
}

export async function getWorkerEntryExport(path: string, entrypoint: string) {
	const module = await moduleRunner.import(path);
	const entrypointValue =
		typeof module === "object" &&
		module !== null &&
		entrypoint in module &&
		module[entrypoint];

	if (!entrypointValue) {
		throw new Error(`${path} does not export a ${entrypoint} entrypoint.`);
	}

	return entrypointValue;
}
