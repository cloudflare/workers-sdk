import "zone.js/dist/zone-node";
import "@angular/platform-server/init";

import { bootstrapApplication } from "@angular/platform-browser";
import { renderApplication } from "@angular/platform-server";

import { AppComponent } from "./app/app.component";
import { config } from "./app/app.config.server";

interface Env {
	ASSETS: { fetch: typeof fetch };
}

// We attach the Cloudflare `fetch()` handler to the global scope
// so that we can export it when we process the Angular output.
// See tools/bundle.mjs
(globalThis as any).__workerFetchHandler = async function fetch(
	request: Request,
	env: Env
) {
	const url = new URL(request.url);
	console.log("render SSR", url.href);

	// Get the root `index.html` content.
	const indexUrl = new URL("/", url);
	const indexResponse = await env.ASSETS.fetch(new Request(indexUrl));
	const document = await indexResponse.text();

	const content = await renderApplication(
		() => bootstrapApplication(AppComponent, config),
		{ document, url: url.pathname }
	);
	// console.log("rendered SSR", content);
	return new Response(content, indexResponse);
};
