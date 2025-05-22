import importedImage from "./imported-image.svg";
import importedText from "./imported-text.txt?url";

interface Env {
	ASSETS: Fetcher;
}

class ElementHandler {
	element(element: Element) {
		element.setInnerContent("New content");
	}
}

export default {
	async fetch(request, env) {
		const { origin, pathname } = new URL(request.url);

		switch (pathname) {
			case "/public-asset": {
				const response = await env.ASSETS.fetch(
					new URL("/public-image.svg", origin)
				);
				const modifiedResponse = new Response(response.body, response);
				modifiedResponse.headers.append("additional-header", "public-asset");

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
				return new Response(`The text content is "${textContent}".`);
			}
			case "/transformed-html": {
				const response = await env.ASSETS.fetch(new URL("/html-page", origin));

				return new HTMLRewriter()
					.on("h1", new ElementHandler())
					.transform(response);
			}
			default: {
				return new Response(null, { status: 404 });
			}
		}
	},
} satisfies ExportedHandler<Env>;
