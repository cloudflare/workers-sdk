import { File } from "node:buffer";
import type {
	ImageInfoResponse,
	RequestInitCfPropertiesImage,
} from "@cloudflare/workers-types/experimental";
import type { FitEnum, Sharp } from "sharp";
import type { Request } from "undici";

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

// Local Sharp mock for the Images binding (`env.IMAGES`).
// Low fidelity (resize/rotate/transcode only); unsupported options are ignored.
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

// Local Sharp mock for `cf.image` fetches (`fetch(url, { cf: { image } })`).
// Follows production cf.image semantics; low fidelity (resize/rotate/transcode only).

const NAMED_QUALITIES: Record<string, number> = {
	low: 35,
	"medium-low": 50,
	"medium-high": 70,
	high: 90,
};

function resolveQuality(
	quality: RequestInitCfPropertiesImage["quality"]
): number | undefined {
	if (typeof quality === "number") {
		return Math.min(100, Math.max(1, Math.round(quality)));
	}
	if (typeof quality === "string" && quality in NAMED_QUALITIES) {
		return NAMED_QUALITIES[quality];
	}
	return undefined;
}

function resolveFit(fit: RequestInitCfPropertiesImage["fit"]): {
	fit: keyof FitEnum;
	withoutEnlargement?: boolean;
} {
	switch (fit) {
		case "contain":
			return { fit: "inside" };
		case "cover":
			return { fit: "cover" };
		case "crop":
			return { fit: "cover", withoutEnlargement: true };
		case "pad":
			return { fit: "contain" };
		case "squeeze":
			return { fit: "fill" };
		case "scale-down":
		default:
			return { fit: "inside", withoutEnlargement: true };
	}
}

function resolveGravity(
	gravity: RequestInitCfPropertiesImage["gravity"]
): string | undefined {
	switch (gravity) {
		case "left":
		case "right":
		case "top":
		case "bottom":
			return gravity;
		case "center":
			return "centre";
		default:
			return undefined;
	}
}

function formatToMime(format: string | undefined): string | null {
	switch (format) {
		case "jpeg":
			return "image/jpeg";
		case "svg":
			return "image/svg+xml";
		case "png":
			return "image/png";
		case "webp":
			return "image/webp";
		case "gif":
			return "image/gif";
		case "avif":
			return "image/avif";
		default:
			return null;
	}
}

function applyCfImageTransforms(
	transformer: Sharp,
	options: RequestInitCfPropertiesImage
): void {
	if (typeof options.rotate === "number") {
		transformer.rotate(options.rotate);
	}

	const dpr =
		typeof options.dpr === "number" && options.dpr > 0 ? options.dpr : 1;
	const width =
		typeof options.width === "number"
			? Math.round(options.width * dpr)
			: undefined;
	const height =
		typeof options.height === "number"
			? Math.round(options.height * dpr)
			: undefined;

	if (width !== undefined || height !== undefined) {
		const { fit, withoutEnlargement } = resolveFit(options.fit);
		transformer.resize(width ?? null, height ?? null, {
			fit,
			withoutEnlargement,
			position: resolveGravity(options.gravity),
			background:
				options.background ?? (options.fit === "pad" ? "#ffffff" : undefined),
		});
	}
}

export async function cfImageLocalFetcher(request: Request): Promise<Response> {
	let sharp;
	try {
		const { default: importedSharp } = await import("sharp");
		sharp = importedSharp;
	} catch {
		return cfImageError(
			"The Sharp library is not available, check your version of Node is compatible"
		);
	}

	let body: unknown;
	let options: RequestInitCfPropertiesImage;
	try {
		const data = await request.formData();
		body = data.get("image");
		const optionsJson = data.get("options");
		options =
			typeof optionsJson === "string"
				? (JSON.parse(optionsJson) as RequestInitCfPropertiesImage)
				: {};
	} catch {
		return cfImageError("Could not parse cf.image transform request");
	}

	if (!body || !(body instanceof File)) {
		return cfImageError("Expected an image in the cf.image transform request");
	}

	const source = await body.arrayBuffer();

	try {
		const metadata = await sharp(source).metadata();

		if (metadata.format === "svg") {
			return cfImageError("SVG inputs are not transformed in local mode");
		}

		if (options.format === "json") {
			const jsonTransformer = sharp(source);
			applyCfImageTransforms(jsonTransformer, options);
			const { info } = await jsonTransformer.toBuffer({
				resolveWithObject: true,
			});
			return Response.json({
				width: info.width,
				height: info.height,
				original: {
					file_size: metadata.size ?? source.byteLength,
					width: metadata.width,
					height: metadata.height,
					format: formatToMime(metadata.format) ?? "application/octet-stream",
				},
			});
		}

		const transformer = sharp(source);
		applyCfImageTransforms(transformer, options);

		const quality = resolveQuality(options.quality);
		let contentType: string;
		switch (options.format) {
			case "avif":
				transformer.avif(quality !== undefined ? { quality } : {});
				contentType = "image/avif";
				break;
			case "webp":
				transformer.webp(quality !== undefined ? { quality } : {});
				contentType = "image/webp";
				break;
			case "jpeg":
			case "baseline-jpeg":
				transformer.jpeg(quality !== undefined ? { quality } : {});
				contentType = "image/jpeg";
				break;
			case "png":
			case "png-force":
				transformer.png();
				contentType = "image/png";
				break;
			default:
				contentType = formatToMime(metadata.format) ?? "image/jpeg";
				break;
		}

		const output = await transformer.toBuffer();
		return new Response(output, {
			headers: {
				"content-type": contentType,
				"cf-resized": "internal=ok/m",
			},
		});
	} catch {
		return cfImageError("Sharp failed to transform the image");
	}
}

// 422 isn't surfaced to the user, instead we fail open and return source image
function cfImageError(message: string): Response {
	return new Response(`cf.image local transform error: ${message}`, {
		status: 422,
		headers: { "content-type": "text/plain" },
	});
}
