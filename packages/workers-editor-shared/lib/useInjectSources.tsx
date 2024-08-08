import { useCallback } from "react";
import { Channel } from "./ipc";
import type { FromErrorPage, SourcesLoadedMessage, ToErrorPage } from "./ipc";
import type { TypedModule } from "./types";

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
