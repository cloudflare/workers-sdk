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
	encoding?: "base64";
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
	// Simple buffered approach: read entire stream, then decode
	// Could be optimized with streaming decode if memory becomes a concern
	const response = new Response(stream);
	const buffer = await response.arrayBuffer();
	return base64DecodeArrayBuffer(buffer);
}

export default class ImagesService extends WorkerEntrypoint<Env> {
	async details(imageId: string): Promise<ImageMetadata | null> {
		const image = imageStore.get(imageId);
		return image?.metadata ?? null;
	}

	async image(imageId: string): Promise<ReadableStream<Uint8Array> | null> {
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
		// Sort by uploaded date, then by ID as a tie-breaker for deterministic ordering
		// This matches production behavior while ensuring stable sort order in tests
		images.sort((a, b) => {
			const dateA = a.uploaded ?? "";
			const dateB = b.uploaded ?? "";
			const dateCompare = options?.sortOrder === "desc"
				? dateB.localeCompare(dateA)
				: dateA.localeCompare(dateB);

			// Use ID as tie-breaker when dates are equal
			if (dateCompare === 0) {
				return options?.sortOrder === "desc"
					? b.id.localeCompare(a.id)
					: a.id.localeCompare(b.id);
			}
			return dateCompare;
		});

		// Handle pagination
		const limit = options?.limit ?? 50;
		let startIndex = 0;

		if (options?.cursor) {
			try {
				// Decode cursor: base64(timestamp_ms:id)
				// Format matches production's (created_at, id) tuple, encoded compactly
				const decoded = atob(options.cursor);
				const separatorIndex = decoded.indexOf(":");
				if (separatorIndex === -1) {
					throw new Error("Invalid cursor format");
				}
				const timestampStr = decoded.substring(0, separatorIndex);
				const id = decoded.substring(separatorIndex + 1);
				const timestamp = parseInt(timestampStr, 10);
				const uploadedDate = new Date(timestamp).toISOString();

				const cursorIndex = images.findIndex(
					(i) => i.uploaded === uploadedDate && i.id === id
				);
				if (cursorIndex >= 0) {
					startIndex = cursorIndex + 1;
				}
			} catch {
				// if invalid cursor, start from beginning
			}
		}

		const paginatedImages = images.slice(startIndex, startIndex + limit);
		const hasMore = startIndex + limit < images.length;
		const lastImage = paginatedImages[paginatedImages.length - 1];

		return {
			images: paginatedImages,
			cursor:
				hasMore && lastImage
					? btoa(
							`${new Date(lastImage.uploaded ?? 0).getTime()}:${lastImage.id}`
						)
					: undefined,
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
