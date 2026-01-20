// In-memory mock for Images binding CRUD operations
// Transforms and info operations are handled via HTTP loopback to Node.js Sharp

import { WorkerEntrypoint } from "cloudflare:workers";
import { CoreBindings, CoreHeaders } from "../core/constants";

interface ImageMetadata {
	id: string;
	filename?: string;
	uploaded?: string;
	requireSignedURLs: boolean;
	meta?: Record<string, unknown>;
	variants: string[];
	draft?: boolean;
	creator?: string;
}

interface ImageUploadOptions {
	id?: string;
	filename?: string;
	requireSignedURLs?: boolean;
	metadata?: Record<string, unknown>;
	creator?: string;
}

interface ImageUpdateOptions {
	requireSignedURLs?: boolean;
	metadata?: Record<string, unknown>;
	creator?: string;
}

interface ImageListOptions {
	limit?: number;
	cursor?: string;
	sortOrder?: "asc" | "desc";
	creator?: string;
}

interface ImageList {
	images: ImageMetadata[];
	cursor?: string;
	listComplete: boolean;
}

interface Env {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
}

// In-memory store for mock images (per-isolate, not persisted)
const imageStore = new Map<string, { metadata: ImageMetadata; data: Uint8Array }>();

export default class ImagesService extends WorkerEntrypoint<Env> {
	async get(imageId: string): Promise<ImageMetadata | null> {
		const image = imageStore.get(imageId);
		return image?.metadata ?? null;
	}

	async getImage(imageId: string): Promise<ReadableStream<Uint8Array> | null> {
		const image = imageStore.get(imageId);
		if (!image) {
			return null;
		}
		return new Blob([image.data]).stream();
	}

	async upload(
		image: ReadableStream<Uint8Array> | ArrayBuffer,
		options?: ImageUploadOptions
	): Promise<ImageMetadata> {
		const buffer =
			image instanceof ArrayBuffer
				? image
				: await new Response(image).arrayBuffer();

		const data = new Uint8Array(buffer);
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

		imageStore.set(id, { metadata, data });
		return metadata;
	}

	async update(
		imageId: string,
		options: ImageUpdateOptions
	): Promise<ImageMetadata> {
		const image = imageStore.get(imageId);
		if (!image) {
			throw new Error(`Image not found: ${imageId}`);
		}

		const updatedMetadata: ImageMetadata = {
			...image.metadata,
			requireSignedURLs:
				options.requireSignedURLs ?? image.metadata.requireSignedURLs,
			meta: options.metadata ?? image.metadata.meta,
			creator: options.creator ?? image.metadata.creator,
		};

		imageStore.set(imageId, { ...image, metadata: updatedMetadata });
		return updatedMetadata;
	}

	async delete(imageId: string): Promise<boolean> {
		return imageStore.delete(imageId);
	}

	async list(options?: ImageListOptions): Promise<ImageList> {
		let images = Array.from(imageStore.values()).map((i) => i.metadata);

		if (options?.creator) {
			images = images.filter((i) => i.creator === options.creator);
		}

		images.sort((a, b) => {
			const dateA = a.uploaded ?? "";
			const dateB = b.uploaded ?? "";
			return options?.sortOrder === "asc"
				? dateA.localeCompare(dateB)
				: dateB.localeCompare(dateA);
		});

		// Handle pagination
		const limit = options?.limit ?? 50;
		let startIndex = 0;

		if (options?.cursor) {
			try {
				const decodedId = atob(options.cursor);
				const cursorIndex = images.findIndex((i) => i.id === decodedId);
				if (cursorIndex >= 0) {
					startIndex = cursorIndex + 1;
				}
			} catch {
				// if invalid cursor, start from beginning
			}
		}

		const paginatedImages = images.slice(startIndex, startIndex + limit);
		const hasMore = startIndex + limit < images.length;
		const lastImageId = paginatedImages[paginatedImages.length - 1]?.id;

		return {
			images: paginatedImages,
			cursor: hasMore && lastImageId ? btoa(lastImageId) : undefined,
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
