import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fetch as miniflareFetch } from "@miniflare/core";
import { watch } from "chokidar";
import { getType } from "mime";
import { Response } from "miniflare";
import type { Headers as MiniflareHeaders } from "@miniflare/core";
import type { Log } from "miniflare";
import type {
	Request as MiniflareRequest,
	RequestInfo,
	RequestInit,
} from "miniflare";

export interface Options {
	log: Log;
	proxyPort?: number;
	directory?: string;
}

export default async function generateASSETSBinding(options: Options) {
	const assetsFetch =
		options.directory !== undefined
			? await generateAssetsFetch(options.directory, options.log)
			: invalidAssetsFetch;

	return async function (request: MiniflareRequest) {
		if (options.proxyPort) {
			try {
				const url = new URL(request.url);
				url.host = `localhost:${options.proxyPort}`;
				return await miniflareFetch(url, request);
			} catch (thrown) {
				options.log.error(new Error(`Could not proxy request: ${thrown}`));

				// TODO: Pretty error page
				return new Response(`[wrangler] Could not proxy request: ${thrown}`, {
					status: 502,
				});
			}
		} else {
			try {
				return await assetsFetch(request);
			} catch (thrown) {
				options.log.error(new Error(`Could not serve static asset: ${thrown}`));

				// TODO: Pretty error page
				return new Response(
					`[wrangler] Could not serve static asset: ${thrown}`,
					{ status: 502 }
				);
			}
		}
	};
}

function escapeRegex(str: string) {
	return str.replace(/[-/\\^$*+?.()|[]{}]/g, "\\$&");
}

type Replacements = Record<string, string>;

function replacer(str: string, replacements: Replacements) {
	for (const [replacement, value] of Object.entries(replacements)) {
		str = str.replace(`:${replacement}`, value);
	}
	return str;
}

function generateRulesMatcher<T>(
	rules?: Record<string, T>,
	replacerFn: (match: T, replacements: Replacements) => T = (match) => match
) {
	// TODO: How can you test cross-host rules?
	if (!rules) return () => [];

	const compiledRules = Object.entries(rules)
		.map(([rule, match]) => {
			const crossHost = rule.startsWith("https://");

			rule = rule.split("*").map(escapeRegex).join("(?<splat>.*)");

			const host_matches = rule.matchAll(
				/(?<=^https:\\\/\\\/[^/]*?):([^\\]+)(?=\\)/g
			);
			for (const hostMatch of host_matches) {
				rule = rule.split(hostMatch[0]).join(`(?<${hostMatch[1]}>[^/.]+)`);
			}

			const path_matches = rule.matchAll(/:(\w+)/g);
			for (const pathMatch of path_matches) {
				rule = rule.split(pathMatch[0]).join(`(?<${pathMatch[1]}>[^/]+)`);
			}

			rule = "^" + rule + "$";

			try {
				const regExp = new RegExp(rule);
				return [{ crossHost, regExp }, match];
			} catch {}
		})
		.filter((value) => value !== undefined) as [
		{ crossHost: boolean; regExp: RegExp },
		T
	][];

	return ({ request }: { request: MiniflareRequest }) => {
		const { pathname, host } = new URL(request.url);

		return compiledRules
			.map(([{ crossHost, regExp }, match]) => {
				const test = crossHost ? `https://${host}${pathname}` : pathname;
				const result = regExp.exec(test);
				if (result) {
					return replacerFn(match, result.groups || {});
				}
			})
			.filter((value) => value !== undefined) as T[];
	};
}

function generateHeadersMatcher(headersFile: string) {
	if (existsSync(headersFile)) {
		const contents = readFileSync(headersFile).toString();

		// TODO: Log errors
		const lines = contents
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => !line.startsWith("#") && line !== "");

		const rules: Record<string, Record<string, string>> = {};
		let rule: { path: string; headers: Record<string, string> } | undefined =
			undefined;

		for (const line of lines) {
			if (/^([^\s]+:\/\/|^\/)/.test(line)) {
				if (rule && Object.keys(rule.headers).length > 0) {
					rules[rule.path] = rule.headers;
				}

				const path = validateURL(line);
				if (path) {
					rule = {
						path,
						headers: {},
					};
					continue;
				}
			}

			if (!line.includes(":")) continue;

			const [rawName, ...rawValue] = line.split(":");
			const name = rawName.trim().toLowerCase();
			const value = rawValue.join(":").trim();

			if (name === "") continue;
			if (!rule) continue;

			const existingValues = rule.headers[name];
			rule.headers[name] = existingValues
				? `${existingValues}, ${value}`
				: value;
		}

		if (rule && Object.keys(rule.headers).length > 0) {
			rules[rule.path] = rule.headers;
		}

		const rulesMatcher = generateRulesMatcher(rules, (match, replacements) =>
			Object.fromEntries(
				Object.entries(match).map(([name, value]) => [
					name,
					replacer(value, replacements),
				])
			)
		);

		return (request: MiniflareRequest) => {
			const matches = rulesMatcher({
				request,
			});
			if (matches) return matches;
		};
	} else {
		return () => undefined;
	}
}

function generateRedirectsMatcher(redirectsFile: string) {
	if (existsSync(redirectsFile)) {
		const contents = readFileSync(redirectsFile).toString();

		// TODO: Log errors
		const lines = contents
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => !line.startsWith("#") && line !== "");

		const rules = Object.fromEntries(
			lines
				.map((line) => line.split(" "))
				.filter((tokens) => tokens.length === 2 || tokens.length === 3)
				.map((tokens) => {
					const from = validateURL(tokens[0], true, false, false);
					const to = validateURL(tokens[1], false, true, true);
					let status: number | undefined = parseInt(tokens[2]) || 302;
					status = [301, 302, 303, 307, 308].includes(status)
						? status
						: undefined;

					return from && to && status ? [from, { to, status }] : undefined;
				})
				.filter((rule) => rule !== undefined) as [
				string,
				{ to: string; status?: number }
			][]
		);

		const rulesMatcher = generateRulesMatcher(
			rules,
			({ status, to }, replacements) => ({
				status,
				to: replacer(to, replacements),
			})
		);

		return (request: MiniflareRequest) => {
			const match = rulesMatcher({
				request,
			})[0];
			if (match) return match;
		};
	} else {
		return () => undefined;
	}
}

function extractPathname(
	path = "/",
	includeSearch: boolean,
	includeHash: boolean
) {
	if (!path.startsWith("/")) path = `/${path}`;
	const url = new URL(`//${path}`, "relative://");
	return `${url.pathname}${includeSearch ? url.search : ""}${
		includeHash ? url.hash : ""
	}`;
}

function validateURL(
	token: string,
	onlyRelative = false,
	includeSearch = false,
	includeHash = false
) {
	const host = /^https:\/\/+(?<host>[^/]+)\/?(?<path>.*)/.exec(token);
	if (host && host.groups && host.groups.host) {
		if (onlyRelative) return;

		return `https://${host.groups.host}${extractPathname(
			host.groups.path,
			includeSearch,
			includeHash
		)}`;
	} else {
		if (!token.startsWith("/") && onlyRelative) token = `/${token}`;

		const path = /^\//.exec(token);
		if (path) {
			try {
				return extractPathname(token, includeSearch, includeHash);
			} catch {}
		}
	}
	return "";
}

function hasFileExtension(pathname: string) {
	return /\/.+\.[a-z0-9]+$/i.test(pathname);
}

async function generateAssetsFetch(
	directory: string,
	log: Log
): Promise<typeof miniflareFetch> {
	// Defer importing miniflare until we really need it
	const { Headers, Request } = await import("@miniflare/core");

	const headersFile = join(directory, "_headers");
	const redirectsFile = join(directory, "_redirects");
	const workerFile = join(directory, "_worker.js");

	const ignoredFiles = [headersFile, redirectsFile, workerFile];

	const assetExists = (path: string) => {
		path = join(directory, path);
		return (
			existsSync(path) &&
			lstatSync(path).isFile() &&
			!ignoredFiles.includes(path)
		);
	};

	const getAsset = (path: string) => {
		if (assetExists(path)) {
			return join(directory, path);
		}
	};

	let redirectsMatcher = generateRedirectsMatcher(redirectsFile);
	let headersMatcher = generateHeadersMatcher(headersFile);

	watch([headersFile, redirectsFile], {
		persistent: true,
	}).on("change", (path) => {
		switch (path) {
			case headersFile: {
				log.log("_headers modified. Re-evaluating...");
				headersMatcher = generateHeadersMatcher(headersFile);
				break;
			}
			case redirectsFile: {
				log.log("_redirects modified. Re-evaluating...");
				redirectsMatcher = generateRedirectsMatcher(redirectsFile);
				break;
			}
		}
	});

	const serveAsset = (file: string) => {
		return readFileSync(file);
	};

	const generateResponse = (request: MiniflareRequest) => {
		const url = new URL(request.url);
		let assetName = url.pathname;
		try {
			//it's possible for someone to send a URL like http://fakehost/abc%2 which would fail to decode
			assetName = decodeURIComponent(url.pathname);
		} catch {}

		const deconstructedResponse: {
			status: number;
			headers: MiniflareHeaders;
			body?: Buffer;
		} = {
			status: 200,
			headers: new Headers(),
			body: undefined,
		};

		const match = redirectsMatcher(request);
		if (match) {
			const { status, to } = match;

			let location = to;
			let search;

			if (to.startsWith("/")) {
				search = new URL(location, "http://fakehost").search;
			} else {
				search = new URL(location).search;
			}

			location = `${location}${search ? "" : url.search}`;

			if (status && [301, 302, 303, 307, 308].includes(status)) {
				deconstructedResponse.status = status;
			} else {
				deconstructedResponse.status = 302;
			}

			deconstructedResponse.headers.set("Location", location);
			return deconstructedResponse;
		}

		if (!request.method?.match(/^(get|head)$/i)) {
			deconstructedResponse.status = 405;
			return deconstructedResponse;
		}

		const notFound = () => {
			let cwd = assetName;
			while (cwd) {
				cwd = cwd.slice(0, cwd.lastIndexOf("/"));

				if ((asset = getAsset(`${cwd}/404.html`))) {
					deconstructedResponse.status = 404;
					deconstructedResponse.body = serveAsset(asset);
					deconstructedResponse.headers.set(
						"Content-Type",
						getType(asset) || "application/octet-stream"
					);
					return deconstructedResponse;
				}
			}

			if ((asset = getAsset(`/index.html`))) {
				deconstructedResponse.body = serveAsset(asset);
				deconstructedResponse.headers.set(
					"Content-Type",
					getType(asset) || "application/octet-stream"
				);
				return deconstructedResponse;
			}

			deconstructedResponse.status = 404;
			return deconstructedResponse;
		};

		let asset;

		if (assetName.endsWith("/")) {
			if ((asset = getAsset(`${assetName}/index.html`))) {
				deconstructedResponse.body = serveAsset(asset);
				deconstructedResponse.headers.set(
					"Content-Type",
					getType(asset) || "application/octet-stream"
				);
				return deconstructedResponse;
			} else if ((asset = getAsset(`${assetName.replace(/\/$/, ".html")}`))) {
				deconstructedResponse.status = 301;
				deconstructedResponse.headers.set(
					"Location",
					`${assetName.slice(0, -1)}${url.search}`
				);
				return deconstructedResponse;
			}
		}

		if (assetName.endsWith("/index")) {
			deconstructedResponse.status = 301;
			deconstructedResponse.headers.set(
				"Location",
				`${assetName.slice(0, -"index".length)}${url.search}`
			);
			return deconstructedResponse;
		}

		if ((asset = getAsset(assetName))) {
			if (assetName.endsWith(".html")) {
				const extensionlessPath = assetName.slice(0, -".html".length);
				if (getAsset(extensionlessPath) || extensionlessPath === "/") {
					deconstructedResponse.body = serveAsset(asset);
					deconstructedResponse.headers.set(
						"Content-Type",
						getType(asset) || "application/octet-stream"
					);
					return deconstructedResponse;
				} else {
					deconstructedResponse.status = 301;
					deconstructedResponse.headers.set(
						"Location",
						`${extensionlessPath}${url.search}`
					);
					return deconstructedResponse;
				}
			} else {
				deconstructedResponse.body = serveAsset(asset);
				deconstructedResponse.headers.set(
					"Content-Type",
					getType(asset) || "application/octet-stream"
				);
				return deconstructedResponse;
			}
		} else if (hasFileExtension(assetName)) {
			if ((asset = getAsset(assetName + ".html"))) {
				deconstructedResponse.body = serveAsset(asset);
				deconstructedResponse.headers.set(
					"Content-Type",
					getType(asset) || "application/octet-stream"
				);
				return deconstructedResponse;
			}
			notFound();
			return deconstructedResponse;
		}

		if ((asset = getAsset(`${assetName}.html`))) {
			deconstructedResponse.body = serveAsset(asset);
			deconstructedResponse.headers.set(
				"Content-Type",
				getType(asset) || "application/octet-stream"
			);
			return deconstructedResponse;
		}

		if ((asset = getAsset(`${assetName}/index.html`))) {
			deconstructedResponse.status = 301;
			deconstructedResponse.headers.set(
				"Location",
				`${assetName}/${url.search}`
			);
			return deconstructedResponse;
		} else {
			notFound();
			return deconstructedResponse;
		}
	};

	const attachHeaders = (
		request: MiniflareRequest,
		deconstructedResponse: {
			status: number;
			headers: MiniflareHeaders;
			body?: Buffer;
		}
	) => {
		const headers = deconstructedResponse.headers;
		const newHeaders = new Headers({});
		const matches = headersMatcher(request) || [];

		matches.forEach((match) => {
			Object.entries(match).forEach(([name, value]) => {
				newHeaders.append(name, `${value}`);
			});
		});

		const combinedHeaders = {
			...Object.fromEntries(headers.entries()),
			...Object.fromEntries(newHeaders.entries()),
		};

		deconstructedResponse.headers = new Headers({});
		Object.entries(combinedHeaders).forEach(([name, value]) => {
			if (value) deconstructedResponse.headers.set(name, value);
		});
	};

	return async (input: RequestInfo, init?: RequestInit) => {
		const request = new Request(input, init);
		const deconstructedResponse = generateResponse(request);
		attachHeaders(request, deconstructedResponse);

		const headers = new Headers();

		[...deconstructedResponse.headers.entries()].forEach(([name, value]) => {
			if (value) headers.set(name, value);
		});

		return new Response(deconstructedResponse.body, {
			headers,
			status: deconstructedResponse.status,
		});
	};
}

const invalidAssetsFetch: typeof miniflareFetch = () => {
	throw new Error(
		"Trying to fetch assets directly when there is no `directory` option specified."
	);
};
