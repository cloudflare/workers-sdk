// KV-backed mock for Images binding CRUD operations
// Image data is stored as KV values, metadata as KV metadata
// Transforms and info operations are handled via HTTP loopback to Node.js Sharp

import { WorkerEntrypoint } from "cloudflare:workers";
import { CoreBindings, CoreHeaders } from "../core/constants";

interface Env {
	IMAGES_STORE: KVNamespace;
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
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

export default class ImagesService extends WorkerEntrypoint<Env> {
	async details(imageId: string): Promise<ImageMetadata | null> {
		const result = await this.env.IMAGES_STORE.getWithMetadata<ImageMetadata>(
			imageId,
			"arrayBuffer"
		);
		return result.metadata ?? null;
	}

	async image(imageId: string): Promise<ReadableStream<Uint8Array> | null> {
		const data = await this.env.IMAGES_STORE.get(imageId, "arrayBuffer");
		if (data === null) {
			return null;
		}
		return new Blob([data]).stream();
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
		return metadata;
	}

	async update(
		imageId: string,
		options: ImageUpdateOptions
	): Promise<ImageMetadata> {
		const existing = await this.env.IMAGES_STORE.getWithMetadata<ImageMetadata>(
			imageId,
			"arrayBuffer"
		);
		if (existing.value === null || existing.metadata === null) {
			throw new Error(`Image not found: ${imageId}`);
		}

		const updatedMetadata: ImageMetadata = {
			...existing.metadata,
			requireSignedURLs:
				options.requireSignedURLs ?? existing.metadata.requireSignedURLs,
			meta: options.metadata ?? existing.metadata.meta,
			creator: options.creator ?? existing.metadata.creator,
		};

		await this.env.IMAGES_STORE.put(imageId, existing.value, {
			metadata: updatedMetadata,
		});
		return updatedMetadata;
	}

	async delete(imageId: string): Promise<boolean> {
		const existing = await this.env.IMAGES_STORE.get(imageId, "arrayBuffer");
		if (existing === null) {
			return false;
		}
		await this.env.IMAGES_STORE.delete(imageId);
		return true;
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

		return {
			images: page,
			cursor: hasMore && lastImage ? lastImage.id : undefined,
			listComplete: !hasMore,
		};
	}

	// Handle HTTP requests for info and transform operations
	// These are forwarded to Node.js via the loopback service where Sharp runs
	async fetch(request: Request): Promise<Response> {
		const forwardRequest = new Request(request);
		forwardRequest.headers.set(
			CoreHeaders.CUSTOM_FETCH_SERVICE,
			CoreBindings.IMAGES_SERVICE
		);
		forwardRequest.headers.set(CoreHeaders.ORIGINAL_URL, request.url);
		return this.env[CoreBindings.SERVICE_LOOPBACK].fetch(forwardRequest);
	}
}
