import { useCallback } from "react";

import type { FromErrorPage, SourcesLoadedMessage, ToErrorPage } from "./ipc";
import type { TypedModule } from "./types";

import { Channel } from "./ipc";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getFilesFromModules(
	entrypoint: string,
	modules: Record<string, TypedModule>,
	serviceWorkerScript: string | undefined
) {
	const isServiceWorker =
		Object.entries(modules).length === 1 && serviceWorkerScript !== undefined;

	const files = isServiceWorker
		? [
				{
					path: entrypoint,
					contents: encoder.encode(serviceWorkerScript),
				},
			]
		: Object.entries(modules)
				.filter(
					([path, m]) =>
						path.endsWith(".js") ||
						m.type === "application/javascript" ||
						m.type === "application/javascript+module"
				)
				.map(([path, m]) => ({
					path,
					contents: m.contents,
				}));

	let internalLines: number | undefined;
	if (isServiceWorker && modules[entrypoint]) {
		const totalScriptLength = serviceWorkerScript?.split("\n").length ?? 0;

		const userScriptLength = decoder
			.decode(modules[entrypoint].contents)
			.split("\n").length;

		internalLines = totalScriptLength - userScriptLength;
	}

	return { files, internalLines };
}

/**
 * This hook works in tandem with the format-errors worker
 * See https://github.com/cloudflare/workers-sdk/tree/main/packages/format-errors/README.md
 *
 * When given a Worker's source, which has:
 * - `entrypoint` & `modules` for a modules-syntax Worker
 * - `entrypoint`, `modules` & `serviceWorkerScript` for a service-worker syntax Worker
 * 	   In this context, `serviceWorkerScript` is the contents of the entrypoint module with
 *     potentially some additional lines of code prepended. The calculated `internalLines` number
 *     represents how many internal lines of code have been prepended, and should be stripped
 *     before displaying to the user. The prepended lines of code can be arbitrary, but in our context
 *     usually represent the middleware system: https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/templates/middleware/loader-sw.ts
 *
 * this hook will return a callback that can be used to respond to the `load` event of
 * an iframe which renders the `format-errors` worker. It will construct the `MessageChannel`
 * & `MessagePort`s appropriately to construct the right messages for inflating the `format-errors`
 * stack traces: https://github.com/cloudflare/workers-sdk/tree/main/packages/format-errors/README.md#L28
 */
export function useInjectSources(
	entrypoint: string | undefined,
	modules: Record<string, TypedModule> | undefined,
	serviceWorkerScript?: string
): (frame: HTMLIFrameElement) => void {
	return useCallback(
		(frame) => {
			// Create a new channel on every load, since they'll be sent to the iframe and can't be used on the next load.
			const errorPage = Channel<ToErrorPage, FromErrorPage>(
				new MessageChannel()
			);
			try {
				frame.contentWindow?.postMessage("PORT", "*", [errorPage.remote]);
			} catch (e) {
				console.error("new load", e);
			}

			errorPage.onMessage((data) => {
				if (!entrypoint || !modules) {
					return;
				}
				if (data.type === "RequestSources") {
					const { files, internalLines } = getFilesFromModules(
						entrypoint,
						modules,
						serviceWorkerScript
					);

					const message: SourcesLoadedMessage = {
						type: "SourcesLoaded",
						body: {
							name: "worker",
							entrypoint,
							files,
							internalLines: internalLines ?? 0,
						},
					};
					errorPage.postMessage(message);
				}
			});
		},
		[entrypoint, modules, serviceWorkerScript]
	);
}
