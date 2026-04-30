// KV-backed mock for Images binding CRUD operations
// Image data is stored as KV values, metadata as KV metadata
// Transforms and info operations are handled via HTTP loopback to Node.js Sharp

import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import { getPublicUrl } from "miniflare:shared";
import { CoreBindings, CoreHeaders, CorePaths } from "../core/constants";

interface Env {
	IMAGES_STORE: KVNamespace;
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
}

function buildVariantUrl(
	publicUrl: URL,
	imageId: string,
	variant: string
): string {
	return new URL(
		`${CorePaths.IMAGE_DELIVERY}/${imageId}/${variant}`,
		publicUrl
	).toString();
}

// Rewrites stored variant names (e.g. `["public"]`) to absolute URLs.
async function withResolvedVariants(
	metadata: ImageMetadata,
	env: Env
): Promise<ImageMetadata> {
	const publicUrl = await getPublicUrl(env[CoreBindings.SERVICE_LOOPBACK]);
	return {
		...metadata,
		variants: metadata.variants.map((variant) =>
			buildVariantUrl(publicUrl, metadata.id, variant)
		),
	};
}

function base64DecodeArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
	const decoder = new TextDecoder();
	const base64String = decoder.decode(buffer);
	const binaryString = atob(base64String.trim());
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

async function base64DecodeStream(
	stream: ReadableStream<Uint8Array>
): Promise<ArrayBuffer> {
	const response = new Response(stream);
	const buffer = await response.arrayBuffer();
	return base64DecodeArrayBuffer(buffer);
}

class ImageHandleImpl extends RpcTarget {
	readonly #imageId: string;
	readonly #env: Env;

	constructor(imageId: string, env: Env) {
		super();
		this.#imageId = imageId;
		this.#env = env;
	}

	async details(): Promise<ImageMetadata | null> {
		const result = await this.#env.IMAGES_STORE.getWithMetadata<ImageMetadata>(
			this.#imageId,
			"arrayBuffer"
		);
		if (result.metadata === null) {
			return null;
		}
		return withResolvedVariants(result.metadata, this.#env);
	}

	async bytes(): Promise<ReadableStream<Uint8Array> | null> {
		const data = await this.#env.IMAGES_STORE.get(this.#imageId, "arrayBuffer");
		if (data === null) {
			return null;
		}
		return new Blob([data]).stream();
	}

	async update(options: ImageUpdateOptions): Promise<ImageMetadata> {
		const existing =
			await this.#env.IMAGES_STORE.getWithMetadata<ImageMetadata>(
				this.#imageId,
				"arrayBuffer"
			);
		if (existing.value === null || existing.metadata === null) {
			throw new Error(`Image not found: ${this.#imageId}`);
		}

		const updatedMetadata: ImageMetadata = {
			...existing.metadata,
			requireSignedURLs:
				options.requireSignedURLs ?? existing.metadata.requireSignedURLs,
			meta: options.metadata ?? existing.metadata.meta,
			creator: options.creator ?? existing.metadata.creator,
		};

		await this.#env.IMAGES_STORE.put(this.#imageId, existing.value, {
			metadata: updatedMetadata,
		});
		return withResolvedVariants(updatedMetadata, this.#env);
	}

	async delete(): Promise<boolean> {
		const existing = await this.#env.IMAGES_STORE.get(
			this.#imageId,
			"arrayBuffer"
		);
		if (existing === null) {
			return false;
		}
		await this.#env.IMAGES_STORE.delete(this.#imageId);
		return true;
	}
}

export default class ImagesService extends WorkerEntrypoint<Env> {
	image(imageId: string): ImageHandleImpl {
		return new ImageHandleImpl(imageId, this.env);
	}

	async upload(
		image: ReadableStream<Uint8Array> | ArrayBuffer,
		options?: ImageUploadOptions
	): Promise<ImageMetadata> {
		let imageData: ReadableStream<Uint8Array> | ArrayBuffer = image;
		if (options?.encoding === "base64") {
			imageData =
				image instanceof ArrayBuffer
					? base64DecodeArrayBuffer(image)
					: await base64DecodeStream(image);
		}

		const buffer =
			imageData instanceof ArrayBuffer
				? imageData
				: await new Response(imageData).arrayBuffer();

		const id = options?.id ?? crypto.randomUUID();

		const metadata: ImageMetadata = {
			id,
			filename: options?.filename ?? "uploaded.jpg",
			uploaded: new Date().toISOString(),
			requireSignedURLs: options?.requireSignedURLs ?? false,
			meta: options?.metadata ?? {},
			variants: ["public"],
			draft: false,
			creator: options?.creator,
		};

		await this.env.IMAGES_STORE.put(id, buffer, { metadata });
		return withResolvedVariants(metadata, this.env);
	}

	async list(options?: ImageListOptions): Promise<ImageList> {
		const limit = options?.limit ?? 50;

		// Fetch all keys so we can filter and sort accurately
		const allImages: ImageMetadata[] = [];
		let kvCursor: string | undefined;
		do {
			const kvResult = await this.env.IMAGES_STORE.list<ImageMetadata>({
				cursor: kvCursor,
			});
			for (const key of kvResult.keys) {
				if (key.metadata) {
					allImages.push(key.metadata);
				}
			}
			kvCursor = kvResult.list_complete ? undefined : kvResult.cursor;
		} while (kvCursor);

		if (options?.creator) {
			allImages.splice(
				0,
				allImages.length,
				...allImages.filter((i) => i.creator === options.creator)
			);
		}

		allImages.sort((a, b) => {
			const dateA = a.uploaded ?? "";
			const dateB = b.uploaded ?? "";
			const cmp = dateA.localeCompare(dateB) || a.id.localeCompare(b.id);
			return options?.sortOrder === "desc" ? -cmp : cmp;
		});

		// Handle cursor-based pagination over the sorted/filtered results
		let startIndex = 0;
		if (options?.cursor) {
			const cursorIndex = allImages.findIndex((i) => i.id === options.cursor);
			if (cursorIndex >= 0) {
				startIndex = cursorIndex + 1;
			}
		}

		const page = allImages.slice(startIndex, startIndex + limit);
		const hasMore = startIndex + limit < allImages.length;
		const lastImage = page[page.length - 1];

		// Resolve variant URLs once per page.
		const publicUrl = await getPublicUrl(
			this.env[CoreBindings.SERVICE_LOOPBACK]
		);
		const resolvedPage = page.map((metadata) => ({
			...metadata,
			variants: metadata.variants.map((variant) =>
				buildVariantUrl(publicUrl, metadata.id, variant)
			),
		}));

		return {
			images: resolvedPage,
			cursor: hasMore && lastImage ? lastImage.id : undefined,
			listComplete: !hasMore,
		};
	}

	async #detectContentType(data: ArrayBuffer): Promise<string> {
		const formData = new FormData();
		formData.append("image", new Blob([data]));

		const infoRequest = new Request("http://placeholder/info", {
			method: "POST",
			body: formData,
		});
		infoRequest.headers.set(
			CoreHeaders.CUSTOM_FETCH_SERVICE,
			CoreBindings.IMAGES_SERVICE
		);

		const response =
			await this.env[CoreBindings.SERVICE_LOOPBACK].fetch(infoRequest);
		if (response.ok) {
			const info = (await response.json()) as { format?: string };
			if (info.format) {
				return info.format;
			}
		}
		return "application/octet-stream";
	}

	// Handle HTTP requests for image delivery and transform operations
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// Serve image bytes at /cdn-cgi/imagedelivery/<id>/<variant>
		if (url.pathname.startsWith(`${CorePaths.IMAGE_DELIVERY}/`)) {
			const parts = url.pathname
				.slice(CorePaths.IMAGE_DELIVERY.length + 1)
				.split("/");
			const imageId = parts[0];
			if (!imageId) {
				return new Response("Missing image ID", { status: 400 });
			}

			const data = await this.env.IMAGES_STORE.get(imageId, "arrayBuffer");
			if (data === null) {
				return new Response("Image not found", { status: 404 });
			}

			const contentType = await this.#detectContentType(data);
			return new Response(data, {
				headers: { "Content-Type": contentType },
			});
		}

		// Forward transform/info operations to Node.js via loopback where Sharp runs
		const forwardRequest = new Request(request);
		forwardRequest.headers.set(
			CoreHeaders.CUSTOM_FETCH_SERVICE,
			CoreBindings.IMAGES_SERVICE
		);
		forwardRequest.headers.set(CoreHeaders.ORIGINAL_URL, request.url);
		return this.env[CoreBindings.SERVICE_LOOPBACK].fetch(forwardRequest);
	}
}
