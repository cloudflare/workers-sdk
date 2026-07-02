// Local handler for `/cdn-cgi/image/<options>/<source>` URL transformations.

import { LogLevel, SharedHeaders } from "miniflare:shared";
import { CoreBindings, CoreHeaders } from "../core/constants";
import type { RequestInitCfPropertiesImage } from "@cloudflare/workers-types/experimental";

interface Env {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
}

// Match `/cdn-cgi/image/<options>/<source>` with an optional adapter prefix
// (`fastly` / `akamai` / `flow`). Mirrors the IRW regex but operates on
// pathname only since we already know the request hit our reserved path.
const PATH_RE = /^\/cdn-cgi\/image\/(?:(fastly|akamai|flow)\/)?([^/]*)\/(.+)$/;

const RESIZING_VIA_TOKEN = "image-resizing";

let warnedLowFidelity = false;

export default {
	async fetch(request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const match = PATH_RE.exec(url.pathname);
		if (!match) {
			// Pathname starts with `/cdn-cgi/image/` but is malformed
			return new Response(null, { status: 404 });
		}

		const [, adapter, optionsStr, rawSource] = match;
		if (adapter && adapter !== "flow") {
			// `fastly` / `akamai` URL flavours aren't supported locally
			return new Response(null, { status: 404 });
		}

		const sourceUrl = resolveSourceUrl(rawSource, url);
		if (!sourceUrl) {
			return new Response(null, { status: 404 });
		}

		const options = parseImageOptions(optionsStr);
		if (!options) {
			return new Response(null, { status: 404 });
		}

		// Fetch the origin image. Stamp a `Via:` header to match production
		const originHeaders = new Headers();
		const accept = request.headers.get("accept");
		if (accept) {
			originHeaders.set("accept", accept);
		}
		originHeaders.set("via", RESIZING_VIA_TOKEN);

		let originResponse: Response;
		try {
			originResponse = await fetch(sourceUrl, { headers: originHeaders });
		} catch {
			return new Response(null, { status: 502 });
		}

		if (!originResponse.ok) {
			return new Response(await originResponse.arrayBuffer(), {
				status: originResponse.status,
				headers: originResponse.headers,
			});
		}

		const source = await originResponse.arrayBuffer();

		const form = new FormData();
		form.append("image", new Blob([source]));
		form.append("options", JSON.stringify(options));

		const transformRequest = new Request("http://localhost/cdn-cgi-image", {
			method: "POST",
			body: form,
		});
		transformRequest.headers.set(
			CoreHeaders.CUSTOM_FETCH_SERVICE,
			CoreBindings.IMAGES_FETCH_SERVICE
		);

		const transformed =
			await env[CoreBindings.SERVICE_LOOPBACK].fetch(transformRequest);

		if (!transformed.ok) {
			// Sharp couldn't decode/transform — fall back to source bytes
			const headers = new Headers(originResponse.headers);
			headers.delete("content-encoding");
			headers.delete("content-length");
			return new Response(source, {
				status: originResponse.status,
				headers,
			});
		}

		await warnLowFidelityOnce(env);
		return transformed;
	},
} satisfies ExportedHandler<Env>;

function resolveSourceUrl(rawSource: string, requestUrl: URL): string | null {
	let source = rawSource;

  // Support URLs that have been through encodeURIComponent (`https%3A%..`)
	if (/^https?%3[Aa]/.test(source)) {
		try {
			source = decodeURIComponent(source);
		} catch {
			return null;
		}
	}

	// Collapse the `https:/example.com` shape (single slash) that nginx
	// historically produces. IRW handles this; we match.
	const absMatch = /^(https?):\/+(.*)/.exec(source);
	if (absMatch) {
		return `${absMatch[1]}://${absMatch[2]}`;
	}

	// Relative path → resolve against the request origin.
	try {
		return new URL(
			source,
			`${requestUrl.protocol}//${requestUrl.host}/`
		).toString();
	} catch {
		return null;
	}
}

// Parse the comma-separated `key=value` options string into an object shaped
// like `cf.image` options, so we can reuse `cfImageLocalFetcher`. This is a
// subset of what production supports:
// (resize, fit, rotate, format, quality, gravity, background, dpr).
const NUMERIC_KEYS = new Set(["width", "height", "rotate", "dpr", "quality"]);

const PASSTHROUGH_KEYS = new Set([
	"fit",
	"format",
	"gravity",
	"background",
	"quality",
]);

function parseImageOptions(raw: string): RequestInitCfPropertiesImage | null {
	if (raw.length === 0) {
		return null;
	}

	let decoded: string;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		return null;
	}

	const options: Record<string, unknown> = {};
	for (const part of decoded.split(",")) {
		if (part.length === 0) {
			continue;
		}
		const eq = part.indexOf("=");
		if (eq === -1) {
			// Bare flags (e.g. `anim=false`) aren't supported in the MVP.
			return null;
		}
		const key = part.slice(0, eq).trim();
		const value = part.slice(eq + 1).trim();

		if (key.length === 0) {
			return null;
		}

		if (NUMERIC_KEYS.has(key)) {
			const asNum = Number(value);
			if (Number.isFinite(asNum)) {
				options[key] = asNum;
				continue;
			}
			// Quality also accepts named strings ("low", "high" etc.).
			if (key === "quality" && PASSTHROUGH_KEYS.has(key)) {
				options[key] = value;
				continue;
			}
			return null;
		}

		if (PASSTHROUGH_KEYS.has(key)) {
			options[key] = value;
			continue;
		}

		// Silently drop unknown keys
	}

	return options as RequestInitCfPropertiesImage;
}

async function warnLowFidelityOnce(env: Env): Promise<void> {
	if (warnedLowFidelity) {
		return;
	}
	warnedLowFidelity = true;
	await env[CoreBindings.SERVICE_LOOPBACK].fetch("http://localhost/core/log", {
		method: "POST",
		headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString() },
		body: "Local `/cdn-cgi/image/` transforms are a low-fidelity mock; only resize, rotate, format conversion and a small set of options are supported. Deploy to preview the full transformation.",
	});
}
