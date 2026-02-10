import { File } from "node:buffer";
import { Request } from "undici";
import type { ImageInfoResponse } from "@cloudflare/workers-types/experimental";
import type { Sharp } from "sharp";

type Transform = {
	imageIndex?: number;
	rotate?: number;
	width?: number;
	height?: number;
};

function validateTransforms(inputTransforms: unknown): Transform[] | null {
	if (!Array.isArray(inputTransforms)) {
		return null;
	}

	for (const transform of inputTransforms) {
		for (const key of ["imageIndex", "rotate", "width", "height"]) {
			if (transform[key] !== undefined && typeof transform[key] != "number") {
				return null;
			}
		}
	}

	return inputTransforms as Transform[];
}

export async function imagesLocalFetcher(request: Request): Promise<Response> {
	let sharp;
	try {
		const { default: importedSharp } = await import("sharp");
		sharp = importedSharp;
	} catch {
		// This should be unreachable, as we should have errored by now
		// if sharp isn't installed
		return errorResponse(
			503,
			9523,
			"The Sharp library is not available, check your version of Node is compatible"
		);
	}

	const data = await request.formData();

	const body = data.get("image");
	if (!body || !(body instanceof File)) {
		return errorResponse(
			400,
			9523,
			`ERROR: Internal Images binding error: expected image in request, got ${body}`
		);
	}

	const transformer = sharp(await body.arrayBuffer(), {});

	const url = new URL(request.url);

	if (url.pathname == "/info") {
		return runInfo(transformer);
	} else {
		const badTransformsResponse = errorResponse(
			400,
			9523,
			"ERROR: Internal Images binding error: Expected JSON array of valid transforms in transforms field"
		);
		try {
			const transformsJson = data.get("transforms");

			if (typeof transformsJson !== "string") {
				return badTransformsResponse;
			}

			const transforms = validateTransforms(JSON.parse(transformsJson));

			if (transforms === null) {
				return badTransformsResponse;
			}

			const outputFormat = data.get("output_format");

			if (outputFormat != null && typeof outputFormat !== "string") {
				return errorResponse(
					400,
					9523,
					"ERROR: Internal Images binding error: Expected output format to be a string if provided"
				);
			}

			return runTransform(transformer, transforms, outputFormat);
		} catch {
			return badTransformsResponse;
		}
	}
}

async function runInfo(transformer: Sharp): Promise<Response> {
	const metadata = await transformer.metadata();

	let mime: string | null = null;
	switch (metadata.format) {
		case "jpeg":
			mime = "image/jpeg";
			break;
		case "svg":
			mime = "image/svg+xml";
			break;
		case "png":
			mime = "image/png";
			break;
		case "webp":
			mime = "image/webp";
			break;
		case "gif":
			mime = "image/gif";
			break;
		case "avif":
			mime = "image/avif";
			break;
		default:
			return errorResponse(
				415,
				9520,
				`ERROR: Unsupported image type ${metadata.format}, expected one of: JPEG, SVG, PNG, WebP, GIF or AVIF`
			);
	}

	let resp: ImageInfoResponse;
	if (mime == "image/svg+xml") {
		resp = {
			format: mime,
		};
	} else {
		if (!metadata.size || !metadata.width || !metadata.height) {
			return errorResponse(
				500,
				9523,
				"ERROR: Internal Images binding error: Expected size, width and height for bitmap input"
			);
		}

		resp = {
			format: mime,
			fileSize: metadata.size,
			width: metadata.width,
			height: metadata.height,
		};
	}

	return Response.json(resp);
}

async function runTransform(
	transformer: Sharp,
	transforms: Transform[],
	outputFormat: string | null
): Promise<Response> {
	for (const transform of transforms) {
		if (transform.imageIndex !== undefined && transform.imageIndex !== 0) {
			// We don't support draws, and this transform doesn't apply to the root
			// image, so skip it
			continue;
		}

		if (transform.rotate !== undefined) {
			transformer.rotate(transform.rotate);
		}

		if (transform.width !== undefined || transform.height !== undefined) {
			transformer.resize(transform.width || null, transform.height || null, {
				fit: "contain",
			});
		}
	}

	switch (outputFormat) {
		case "image/avif":
			transformer.avif();
			break;
		case "image/gif":
			return errorResponse(
				415,
				9520,
				"ERROR: GIF output is not supported in local mode"
			);
		case "image/jpeg":
			transformer.jpeg();
			break;
		case "image/png":
			transformer.png();
			break;
		case "image/webp":
			transformer.webp();
			break;
		case "rgb":
		case "rgba":
			return errorResponse(
				415,
				9520,
				"ERROR: RGB/RGBA output is not supported in local mode"
			);
		default:
			outputFormat = "image/jpeg";
			break;
	}

	return new Response(transformer, {
		headers: {
			"content-type": outputFormat,
		},
	});
}

function errorResponse(status: number, code: number, message: string) {
	return new Response(`ERROR ${code}: ${message}`, {
		status,
		headers: {
			"content-type": "text/plain",
			"cf-images-binding": `err=${code}`,
		},
	});
}
