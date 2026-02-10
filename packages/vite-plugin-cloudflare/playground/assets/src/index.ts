import html from "./index.html?raw";
import importedImage from "./imported-image.svg";
import importedText from "./imported-text.txt?url";
import inlineImage from "./inline-image.svg?inline";
// Import CSS to ensure this doesn't cause errors
import "./index.css";

interface Env {
	ASSETS: Fetcher;
}

class ElementHandler {
	element(element: Element) {
		element.setInnerContent("Modified content");
	}
}

export default {
	async fetch(request, env) {
		const { origin, pathname } = new URL(request.url);

		switch (pathname) {
			case "/public-directory-asset": {
				const response = await env.ASSETS.fetch(
					new URL("/public-image.svg", origin)
				);
				const modifiedResponse = new Response(response.body, response);
				modifiedResponse.headers.append(
					"additional-header",
					"public-directory-asset"
				);

				return modifiedResponse;
			}
			case "/imported-asset": {
				const response = await env.ASSETS.fetch(new URL(importedImage, origin));
				const modifiedResponse = new Response(response.body, response);
				modifiedResponse.headers.append("additional-header", "imported-asset");

				return modifiedResponse;
			}
			case "/imported-asset-url-suffix": {
				const response = await env.ASSETS.fetch(new URL(importedText, origin));
				const textContent = await response.text();

				return new Response(`The text content is "${textContent}"`);
			}
			case "/inline-asset": {
				const response = await env.ASSETS.fetch(new URL(inlineImage, origin));
				const modifiedResponse = new Response(response.body, response);
				modifiedResponse.headers.append("additional-header", "inline-asset");

				return modifiedResponse;
			}
			case "/transformed-html-asset": {
				const response = await env.ASSETS.fetch(new URL("/html-page", origin));

				return new HTMLRewriter()
					.on("h1", new ElementHandler())
					.transform(response);
			}
			default: {
				return new Response(html, { headers: { "content-type": "text/html" } });
			}
		}
	},
} satisfies ExportedHandler<Env>;
