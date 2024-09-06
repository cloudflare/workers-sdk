import { WorkerEntrypoint } from "cloudflare:workers";
import { AssetsManifest } from "./assets-manifest";
import {
	InternalServerErrorResponse,
	MethodNotAllowedResponse,
	NotFoundResponse,
	OkResponse,
	TemporaryRedirectResponse,
} from "./responses";
import { getAdditionalHeaders, getMergedHeaders } from "./utils/headers";
import { getAssetWithMetadataFromKV } from "./utils/kv";

type Env = {
	// ASSETS_MANIFEST is a pipeline binding to an ArrayBuffer containing the
	// binary-encoded site manifest
	ASSETS_MANIFEST: ArrayBuffer;

	// ASSETS_KV_NAMESPACE is a pipeline binding to the KV namespace that the
	// assets are in.
	ASSETS_KV_NAMESPACE: KVNamespace;
};

interface Configuration {
	serveExactMatchesOnly?: boolean;
	trailingSlashes?: "auto" | "add" | "remove";
	notFoundBehavior?:
		| "default"
		| "single-page-application"
		| "404-page"
		| "nearest-404-page";
}

type Action =
	| { asset: { entry: string; status: 200 | 404 }; redirect: undefined }
	| { asset: undefined; redirect: string }
	| null;

export default class extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
		return this.fetchWithConfiguration(request, {
			serveExactMatchesOnly: true,
		});
	}

	async fetchWithConfiguration(request: Request, configuration: Configuration) {
		try {
			return this.handleRequest(request, configuration);
		} catch (err) {
			return new InternalServerErrorResponse(err as Error);
		}
	}

	private async handleRequest(request: Request, configuration: Configuration) {
		const action = await this.getAction(request, configuration);
		if (!action) {
			return new NotFoundResponse();
		}
		// if there was a POST etc. to a route without an asset
		// this should be passed onto a user worker if one exists
		// so prioritise returning a 404 over 405?
		const method = request.method.toUpperCase();
		if (!["GET", "HEAD"].includes(method)) {
			return new MethodNotAllowedResponse();
		}
		if (action.redirect) {
			return new TemporaryRedirectResponse(action.redirect);
		}
		if (!action.asset) {
			return new InternalServerErrorResponse(new Error("Unknown action"));
		}
		// const eTag = `"${assetEntry}"`;
		// const weakETag = `W/${eTag}`;

		// const ifNoneMatch = request.headers.get("If-None-Match") || "";

		const assetResponse = await getAssetWithMetadataFromKV(
			this.env.ASSETS_KV_NAMESPACE,
			action.asset.entry
		);

		if (!assetResponse || !assetResponse.value) {
			throw new Error(
				`Requested asset ${action.asset.entry} exists in the asset manifest but not in the KV namespace.`
			);
		}

		const { value: assetContent, metadata: assetMetadata } = assetResponse;
		const additionalHeaders = getAdditionalHeaders(
			action.asset.entry,
			assetMetadata,
			request
		);
		const headers = getMergedHeaders(request.headers, additionalHeaders);

		// if ([weakETag, eTag].includes(ifNoneMatch)) {
		// 	return new NotModifiedResponse(null, { headers });
		// }
		const body = method === "HEAD" ? null : assetContent;
		if (action.asset.status === 404) {
			return new NotFoundResponse(body, { headers });
		} else if (action.asset.status === 200) {
			return new OkResponse(body, { headers });
		} else {
			return new InternalServerErrorResponse(
				new Error("Unknown action asset response status")
			);
		}
	}

	private async getAction(
		request: Request,
		configuration: Configuration
	): Promise<Action> {
		const url = new URL(request.url);
		const assetsManifest = new AssetsManifest(this.env.ASSETS_MANIFEST);

		if (configuration.serveExactMatchesOnly) {
			const entry = await assetsManifest.get(url.pathname);
			if (entry) {
				return { asset: { entry, status: 200 }, redirect: undefined };
			} else {
				return this.notFound(assetsManifest, url.pathname, configuration);
			}
		} else if (configuration.trailingSlashes === "add") {
			let entry = await assetsManifest.get(url.pathname);
			let actual = url.pathname;
			// try alternatives:
			if (!entry) {
				if (url.pathname.endsWith("/")) {
					actual = url.pathname + "index.html";
					entry = await assetsManifest.get(actual);
					if (!entry) {
						actual = url.pathname.slice(0, -1) + ".html";
						entry = await assetsManifest.get(actual);
					}
				} else {
					actual = url.pathname + "/index.html";
					entry = await assetsManifest.get(actual);
					if (!entry) {
						actual = url.pathname + ".html";
						entry = await assetsManifest.get(actual);
					}
				}
			}

			if (!entry) {
				return this.notFound(assetsManifest, url.pathname, configuration);
			}

			this.handleRedirect(actual, entry);
		} else if (configuration.trailingSlashes === "remove") {
			let entry = await assetsManifest.get(url.pathname);
			let actual = url.pathname;
			// try alternatives:
			if (!entry) {
				if (url.pathname.endsWith("/")) {
					actual = url.pathname.slice(0, -1) + ".html";
					entry = await assetsManifest.get(actual);
					if (!entry) {
						actual = url.pathname + "index.html";
						entry = await assetsManifest.get(actual);
					}
				} else {
					actual = url.pathname + ".html";
					entry = await assetsManifest.get(actual);
					if (!entry) {
						actual = url.pathname + "/index.html";
						entry = await assetsManifest.get(actual);
					}
				}
			}

			if (!entry) {
				return this.notFound(assetsManifest, url.pathname, configuration);
			}

			this.handleRedirect(actual, entry);
		} else {
			// configuration.serveExactMatchesOnly === false &&
			// configuration.trailingSlashes === 'auto'
			let entry = await assetsManifest.get(url.pathname);
			let actual = url.pathname;
			// try alternatives:
			if (!entry) {
				if (url.pathname.endsWith("/")) {
					actual = url.pathname + "index.html";
					entry = await assetsManifest.get(actual);
					if (!entry) {
						actual = url.pathname.slice(0, -1) + ".html";
						entry = await assetsManifest.get(actual);
					}
				} else {
					actual = url.pathname + ".html";
					entry = await assetsManifest.get(actual);
					if (!entry) {
						actual = url.pathname + "/index.html";
						entry = await assetsManifest.get(actual);
					}
				}
			}

			if (!entry) {
				return this.notFound(assetsManifest, url.pathname, configuration);
			}

			this.handleRedirect(actual, entry);
		}

		return null;
	}

	private handleRedirect(actual: string, entry: string) {
		// determine redirects:
		if (actual.endsWith("index.html")) {
			// /folder/index.html -> /folder/
			return {
				asset: undefined,
				redirect: actual.slice(0, -10),
			};
		} else if (actual.endsWith(".html")) {
			// /file.html -> /file
			return {
				asset: undefined,
				redirect: actual.slice(0, -5),
			};
		}
		return {
			asset: { entry, status: 200 },
			redirect: undefined,
		};
	}

	private async notFound(
		assetsManifest: AssetsManifest,
		pathname: string,
		configuration: Configuration
	): Promise<Action> {
		if (configuration.notFoundBehavior === "single-page-application") {
			const entry = await assetsManifest.get("/index.html");
			if (entry) {
				return { asset: { entry, status: 200 }, redirect: undefined };
			}
		} else if (configuration.notFoundBehavior === "404-page") {
			const entry = await assetsManifest.get("/404.html");
			if (entry) {
				return { asset: { entry, status: 404 }, redirect: undefined };
			}
		} else if (configuration.notFoundBehavior === "nearest-404-page") {
			let cwd = pathname;
			while (cwd) {
				cwd = cwd.slice(0, cwd.lastIndexOf("/"));
				const entry = await assetsManifest.get(`${cwd}/404.html`);
				if (entry) {
					return { asset: { entry, status: 404 }, redirect: undefined };
				}
			}
		}

		return null;
	}
}
