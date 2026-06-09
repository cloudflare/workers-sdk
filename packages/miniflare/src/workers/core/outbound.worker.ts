// General-purpose outbound interceptor for user Workers.
//
// This Worker sits at the top of every user Worker's `globalOutbound` chain and
// applies a small pipeline to outbound `fetch()`es before they continue down to
// the previous outbound (the user's `outboundService`, or the internet):
//
//   1. `stripCfConnectingIp` — removes the `CF-Connecting-IP` header and sets
//      `CF-Worker`, matching production edge behaviour. Toggled by the public
//      `stripCfConnectingIp` Miniflare option.
//   2. `cf.image` — when a request carries `cf.image` transform options
//      (`fetch(url, { cf: { image: { ... } } })`), the origin image is fetched
//      and transformed locally via Sharp, mirroring the production
//      "transform via Workers" feature. This is always on.

import { LogLevel, SharedHeaders } from "miniflare:shared";
import { CoreBindings, CoreHeaders } from "./constants";
import type { RequestInitCfPropertiesImage } from "@cloudflare/workers-types/experimental";

interface Env {
	CF_WORKER_ZONE: string;
	STRIP_CF_CONNECTING_IP: boolean;
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
}

const RESIZING_VIA_TOKEN = "image-resizing";

let warnedLowFidelity = false;

export default {
	async fetch(request, env: Env) {
		const image = (
			request.cf as { image?: RequestInitCfPropertiesImage } | undefined
		)?.image;

		const hasImageOptions =
			image !== undefined &&
			image !== null &&
			typeof image === "object" &&
			Object.keys(image).length > 0;

		if (!hasImageOptions) {
			const headers = strippedHeaders(request, env);
			return headers ? fetch(request, { headers }) : fetch(request);
		}

		return resizeImage(request, env, image);
	},
} satisfies ExportedHandler<Env>;

function strippedHeaders(request: Request, env: Env): Headers | undefined {
	if (!env.STRIP_CF_CONNECTING_IP) {
		return undefined;
	}
	const headers = new Headers(request.headers);
	headers.delete("CF-Connecting-IP");
	headers.set("CF-Worker", env.CF_WORKER_ZONE);
	return headers;
}

async function resizeImage(
	request: Request,
	env: Env,
	image: RequestInitCfPropertiesImage
): Promise<Response> {
	const headers = strippedHeaders(request, env) ?? new Headers(request.headers);
	const via = headers.get("via");
	headers.set(
		"via",
		via ? `${via}, ${RESIZING_VIA_TOKEN}` : RESIZING_VIA_TOKEN
	);

	const originResponse = await fetch(request, { headers });

	if (!originResponse.ok) {
		return originResponse;
	}

	const source = await originResponse.arrayBuffer();

	const form = new FormData();
	form.append("image", new Blob([source]));
	form.append("options", JSON.stringify(image));

	const transformRequest = new Request("http://localhost/cf-image", {
		method: "POST",
		body: form,
	});
	transformRequest.headers.set(
		CoreHeaders.CUSTOM_FETCH_SERVICE,
		CoreBindings.IMAGES_FETCH_SERVICE
	);

	const transformed =
		await env[CoreBindings.SERVICE_LOOPBACK].fetch(transformRequest);

	// If Sharp can't transform the image return the origin image
	if (!transformed.ok) {
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
}

async function warnLowFidelityOnce(env: Env): Promise<void> {
	if (warnedLowFidelity) {
		return;
	}
	warnedLowFidelity = true;
	await env[CoreBindings.SERVICE_LOOPBACK].fetch("http://localhost/core/log", {
		method: "POST",
		headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString() },
		body: "Local cf.image transforms are a low-fidelity mock; only resize, rotate and format conversion are applied. Deploy to preview the full transformation.",
	});
}
