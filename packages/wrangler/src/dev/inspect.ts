import { readFileSync } from "fs";
import os from "node:os";
import { URL, fileURLToPath } from "node:url";
import path from "path";
import open from "open";
import {
	isAllowedSourceMapPath,
	isAllowedSourcePath,
} from "../api/startDevWorker/bundle-allowed-paths";
import { logger } from "../logger";
import type { EsbuildBundle } from "../dev/use-esbuild";
import type Protocol from "devtools-protocol";
import type { RawSourceMap } from "source-map";

/**
 * This function converts a message serialized as a devtools event
 * into arguments suitable to be called by a console method, and
 * then actually calls the method with those arguments. Effectively,
 * we're just doing a little bit of the work of the devtools console,
 * directly in the terminal.
 */
const mapConsoleAPIMessageTypeToConsoleMethod: {
	[key in Protocol.Runtime.ConsoleAPICalledEvent["type"]]: Exclude<
		keyof Console,
		"Console"
	>;
} = {
	log: "log",
	debug: "debug",
	info: "info",
	warning: "warn",
	error: "error",
	dir: "dir",
	dirxml: "dirxml",
	table: "table",
	trace: "trace",
	clear: "clear",
	count: "count",
	assert: "assert",
	profile: "profile",
	profileEnd: "profileEnd",
	timeEnd: "timeEnd",
	startGroup: "group",
	startGroupCollapsed: "groupCollapsed",
	endGroup: "groupEnd",
};

export function logConsoleMessage(
	evt: Protocol.Runtime.ConsoleAPICalledEvent
): void {
	const args: string[] = [];
	for (const ro of evt.args) {
		switch (ro.type) {
			case "string":
			case "number":
			case "boolean":
			case "undefined":
			case "symbol":
			case "bigint":
				args.push(ro.value);
				break;
			case "function":
				args.push(`[Function: ${ro.description ?? "<no-description>"}]`);
				break;
			case "object":
				if (!ro.preview) {
					args.push(
						ro.subtype === "null"
							? "null"
							: ro.description ?? "<no-description>"
					);
				} else {
					args.push(ro.preview.description ?? "<no-description>");

					switch (ro.preview.subtype) {
						case "array":
							args.push(
								"[ " +
									ro.preview.properties
										.map(({ value }) => {
											return value;
										})
										.join(", ") +
									(ro.preview.overflow ? "..." : "") +
									" ]"
							);

							break;
						case "weakmap":
						case "map":
							ro.preview.entries === undefined
								? args.push("{}")
								: args.push(
										"{\n" +
											ro.preview.entries
												.map(({ key, value }) => {
													return `  ${key?.description ?? "<unknown>"} => ${
														value.description
													}`;
												})
												.join(",\n") +
											(ro.preview.overflow ? "\n  ..." : "") +
											"\n}"
								  );

							break;
						case "weakset":
						case "set":
							ro.preview.entries === undefined
								? args.push("{}")
								: args.push(
										"{ " +
											ro.preview.entries
												.map(({ value }) => {
													return `${value.description}`;
												})
												.join(", ") +
											(ro.preview.overflow ? ", ..." : "") +
											" }"
								  );
							break;
						case "regexp":
							break;
						case "date":
							break;
						case "generator":
							args.push(ro.preview.properties[0].value || "");
							break;
						case "promise":
							if (ro.preview.properties[0].value === "pending") {
								args.push(`{<${ro.preview.properties[0].value}>}`);
							} else {
								args.push(
									`{<${ro.preview.properties[0].value}>: ${ro.preview.properties[1].value}}`
								);
							}
							break;
						case "node":
						case "iterator":
						case "proxy":
						case "typedarray":
						case "arraybuffer":
						case "dataview":
						case "webassemblymemory":
						case "wasmvalue":
							break;
						case "error":
						default:
							// just a pojo
							args.push(
								"{\n" +
									ro.preview.properties
										.map(({ name, value }) => {
											return `  ${name}: ${value}`;
										})
										.join(",\n") +
									(ro.preview.overflow ? "\n  ..." : "") +
									"\n}"
							);
					}
				}
				break;
			default:
				args.push(ro.description || ro.unserializableValue || "🦋");
				break;
		}
	}

	const method = mapConsoleAPIMessageTypeToConsoleMethod[evt.type];

	if (method in console) {
		switch (method) {
			case "dir":
				console.dir(args);
				break;
			case "table":
				console.table(args);
				break;
			default:
				// eslint-disable-next-line prefer-spread
				console[method].apply(console, args);
				break;
		}
	} else {
		logger.warn(`Unsupported console method: ${method}`);
		logger.warn("console event:", evt);
	}
}

export function maybeHandleNetworkLoadResource(
	url: string | URL,
	bundle: EsbuildBundle,
	tmpDir?: string
): string | undefined {
	if (typeof url === "string") url = new URL(url);
	if (url.protocol !== "file:") return;
	const filePath = fileURLToPath(url);

	if (isAllowedSourceMapPath(bundle, filePath)) {
		// Read and parse the source map
		const sourceMap: RawSourceMap & {
			x_google_ignoreList?: number[];
		} = JSON.parse(readFileSync(filePath, "utf-8"));

		// See https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit#heading=h.mt2g20loc2ct
		// The above link documents the `x_google_ignoreList property`, which is
		// intended to mark code that shouldn't be visible in DevTools. We use it to
		// indicate specifically Wrangler-injected code (facades & middleware).
		sourceMap.x_google_ignoreList = sourceMap.sources
			// Filter anything in the generated `tmpDir`, and anything from Wrangler's
			// templates. This should cover facades and middleware, but intentionally
			// doesn't include all non-user code e.g. `node_modules`.
			.map((source, i) => {
				if (source.includes("wrangler/templates")) return i;
				if (
					tmpDir !== undefined &&
					path.resolve(sourceMap?.sourceRoot ?? "", source).includes(tmpDir)
				)
					return i;
			})
			.filter((i): i is number => i !== undefined);

		return JSON.stringify(sourceMap);
	}

	if (isAllowedSourcePath(bundle, filePath)) {
		return readFileSync(filePath, "utf-8");
	}
}

/**
 * Opens the chrome debugger
 */
export const openInspector = async (
	inspectorPort: number,
	worker: string | undefined
) => {
	const query = new URLSearchParams();
	query.set("theme", "systemPreferred");
	query.set("ws", `127.0.0.1:${inspectorPort}/ws`);
	if (worker) query.set("domain", worker);
	query.set("debugger", "true");
	const url = `https://devtools.devprod.cloudflare.dev/js_app?${query.toString()}`;
	const errorMessage =
		"Failed to open inspector.\nInspector depends on having a Chromium-based browser installed, maybe you need to install one?";

	// see: https://github.com/sindresorhus/open/issues/177#issue-610016699
	let braveBrowser: string;
	switch (os.platform()) {
		case "darwin":
		case "win32":
			braveBrowser = "Brave";
			break;
		default:
			braveBrowser = "brave";
	}

	const childProcess = await open(url, {
		app: [
			{
				name: open.apps.chrome,
			},
			{
				name: braveBrowser,
			},
			{
				name: open.apps.edge,
			},
			{
				name: open.apps.firefox,
			},
		],
	});
	childProcess.on("error", () => {
		logger.warn(errorMessage);
	});
};
