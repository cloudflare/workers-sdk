import { log } from "console";
import { importSharp } from "./helper.js";

/**
 * Local implementation of the imagesEdgeApiFetcher that generates colored PNG images
 * based on the Image Id.
 *
 * Extracts a hex color code from the request URL's pathname and generates a 200x200
 * PNG image filled with that color. If the pathname doesn't contain a valid 6-digit
 * hex color code, defaults to red (FF0000).
 *
 * @param request - the inbound request
 * @returns Promise<Response> containing the generated PNG image
 *
 * @example
 * // URL: /images/ff0000 -> red image
 * // URL: /images/00ff00 -> green image
 * // URL: /images/invalid -> red image (default)
 */
export async function imagesLocalEdgeApiFetcher(
	request: Request
): Promise<Response> {
	log(`imagesLocalEdgeApiFetcher: ${request}`);

	let sharp;
	try {
		sharp = await importSharp();
	} catch (error) {
		return error as Response;
	}

	const url = new URL(request.url);
	const pathname = url.pathname;
	const hexColor = pathname.split("/").pop() || "red";
	let r = 255,
		g = 0,
		b = 0;

	if (/^[0-9a-fA-F]{6}$/.test(hexColor)) {
		r = parseInt(hexColor.slice(0, 2), 16);
		g = parseInt(hexColor.slice(2, 4), 16);
		b = parseInt(hexColor.slice(4, 6), 16);
	}

	const buffer = await sharp({
		create: {
			width: 200,
			height: 200,
			channels: 3,
			background: { r, g, b },
		},
	})
		.png()
		.toBuffer();

	return new Response(buffer, {
		status: 200,
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": "no-cache",
		},
	});
}
