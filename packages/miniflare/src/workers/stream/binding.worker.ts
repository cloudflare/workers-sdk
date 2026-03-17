import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import { BlobStore, SharedBindings } from "miniflare:shared";

interface Env {
	STREAM_DB: D1Database;
	STREAM_BINDING_NAME: string;
	[SharedBindings.MAYBE_SERVICE_BLOBS]: Fetcher;
}

interface StoredStatus {
	state: string;
	pctComplete: string;
	errorReasonCode?: string;
	errorReasonText?: string;
}

interface StoredVideo {
	id: string;
	blobId: string;
	filename: string;
	contentType: string;
	size: number;
	createdAt: string;
	updatedAt: string;
	creator?: string;
	meta?: Record<string, string>;
	allowedOrigins?: string[];
	requireSignedURLs?: boolean;
	thumbnailTimestampPct?: number;
	scheduledDeletion?: string;
	watermark?: StoredWatermark;
	maxDurationSeconds?: number;
	maxSizeBytes?: number;
	status: StoredStatus;
	source: "file" | "url" | "direct_upload";
	url?: string;
}

interface StoredDirectUpload {
	token: string;
	videoId: string;
	expiresAt?: string;
	usedAt?: string;
	params: StoredUploadParams;
}

interface StoredCaption {
	videoId: string;
	language: string;
	label: string;
	generated: boolean;
	status: "ready" | "inprogress" | "error";
	blobId?: string;
	createdAt: string;
	updatedAt: string;
}

interface StoredWatermark {
	id: string;
	name?: string;
	createdAt: string;
	width?: number;
	height?: number;
	opacity?: number;
	padding?: number;
	scale?: number;
	position?: string;
	fileName?: string;
	contentType?: string;
	url?: string;
	blobId?: string;
}

interface StoredUploadParams {
	allowedOrigins?: string[];
	creator?: string;
	meta?: Record<string, string>;
	requireSignedURLs?: boolean;
	thumbnailTimestampPct?: number;
	scheduledDeletion?: string;
	watermark?: StoredWatermark;
	maxDurationSeconds?: number;
	maxSizeBytes?: number;
}

const STREAM_SCHEMA = [
	`CREATE TABLE IF NOT EXISTS videos (
		id TEXT PRIMARY KEY,
		blob_id TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		record_json TEXT NOT NULL
	);`,
	`CREATE TABLE IF NOT EXISTS direct_uploads (
		token TEXT PRIMARY KEY,
		video_id TEXT NOT NULL,
		expires_at TEXT,
		used_at TEXT,
		record_json TEXT NOT NULL
	);`,
	`CREATE TABLE IF NOT EXISTS captions (
		video_id TEXT NOT NULL,
		language TEXT NOT NULL,
		blob_id TEXT,
		record_json TEXT NOT NULL,
		PRIMARY KEY (video_id, language)
	);`,
	`CREATE TABLE IF NOT EXISTS watermarks (
		id TEXT PRIMARY KEY,
		blob_id TEXT,
		record_json TEXT NOT NULL
	);`,
] as const;

function nowISOString() {
	return new Date().toISOString();
}

function jsonParse<T>(value: string): T {
	return JSON.parse(value) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getOptionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function getOptionalNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function getOptionalBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function getOptionalStringArray(value: unknown): string[] | undefined {
	if (
		!Array.isArray(value) ||
		!value.every((item) => typeof item === "string")
	) {
		return undefined;
	}
	return value;
}

function getOptionalStringRecord(
	value: unknown
): Record<string, string> | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const entries = Object.entries(value).filter(
		(entry): entry is [string, string] => typeof entry[1] === "string"
	);
	return Object.fromEntries(entries);
}

function getWatermarkReference(value: unknown): StoredWatermark | undefined {
	if (typeof value === "string") {
		return {
			id: value,
			createdAt: nowISOString(),
		};
	}
	if (isRecord(value) && typeof value.id === "string") {
		return {
			id: value.id,
			createdAt: getOptionalString(value.createdAt) ?? nowISOString(),
			name: getOptionalString(value.name),
			width: getOptionalNumber(value.width),
			height: getOptionalNumber(value.height),
			opacity: getOptionalNumber(value.opacity),
			padding: getOptionalNumber(value.padding),
			scale: getOptionalNumber(value.scale),
			position: getOptionalString(value.position),
			fileName: getOptionalString(value.fileName),
			contentType: getOptionalString(value.contentType),
			url: getOptionalString(value.url),
		};
	}
	return undefined;
}

function pickUploadParams(value: unknown): StoredUploadParams {
	const record = isRecord(value) ? value : {};
	return {
		allowedOrigins: getOptionalStringArray(record.allowedOrigins),
		creator: getOptionalString(record.creator),
		meta: getOptionalStringRecord(record.meta),
		requireSignedURLs: getOptionalBoolean(record.requireSignedURLs),
		thumbnailTimestampPct: getOptionalNumber(record.thumbnailTimestampPct),
		scheduledDeletion: getOptionalString(record.scheduledDeletion),
		watermark: getWatermarkReference(record.watermark),
		maxDurationSeconds: getOptionalNumber(record.maxDurationSeconds),
		maxSizeBytes: getOptionalNumber(record.maxSizeBytes),
	};
}

function baseRoute(binding: string) {
	return `/cdn-cgi/handler/stream/${encodeURIComponent(binding)}`;
}

function videoRoute(binding: string, videoId: string) {
	return `${baseRoute(binding)}/videos/${encodeURIComponent(videoId)}`;
}

function toStreamWatermark(watermark: StoredWatermark): StreamWatermark {
	return {
		id: watermark.id,
		name: watermark.name,
		created: watermark.createdAt,
		width: watermark.width,
		height: watermark.height,
		opacity: watermark.opacity,
		padding: watermark.padding,
		scale: watermark.scale,
		position: watermark.position,
		url: watermark.url,
	} as unknown as StreamWatermark;
}

function toStreamCaption(caption: StoredCaption): StreamCaption {
	return {
		language: caption.language,
		label: caption.label,
		generated: caption.generated,
		status: caption.status,
	} as StreamCaption;
}

function toStreamVideo(binding: string, video: StoredVideo): StreamVideo {
	const route = videoRoute(binding, video.id);
	return {
		id: video.id,
		creator: video.creator,
		meta: video.meta,
		allowedOrigins: video.allowedOrigins,
		requireSignedURLs: video.requireSignedURLs,
		thumbnailTimestampPct: video.thumbnailTimestampPct,
		scheduledDeletion: video.scheduledDeletion,
		maxDurationSeconds: video.maxDurationSeconds,
		maxSizeBytes: video.maxSizeBytes,
		uploaded: video.createdAt,
		modified: video.updatedAt,
		size: video.size,
		preview: `${route}/preview`,
		thumbnail: `${route}/thumbnail.jpg`,
		hlsPlaybackUrl: `${route}/manifest/video.m3u8`,
		dashPlaybackUrl: `${route}/manifest/video.mpd`,
		status: {
			state: video.status.state,
			pctComplete: Number(video.status.pctComplete),
			errorReasonCode: video.status.errorReasonCode,
			errorReasonText: video.status.errorReasonText,
		},
		watermark: video.watermark ? toStreamWatermark(video.watermark) : undefined,
	} as unknown as StreamVideo;
}

class StreamStore {
	readonly #binding: string;
	readonly #blob: BlobStore;

	constructor(
		private readonly env: Env,
		binding: string
	) {
		this.#binding = binding;
		this.#blob = new BlobStore(
			env[SharedBindings.MAYBE_SERVICE_BLOBS],
			`stream-${binding}`,
			false
		);
	}

	async ensureSchema() {
		for (const statement of STREAM_SCHEMA) {
			await this.env.STREAM_DB.prepare(statement).run();
		}
	}

	private async insertVideo(video: StoredVideo): Promise<StreamVideo> {
		await this.env.STREAM_DB.prepare(
			`INSERT INTO videos (id, blob_id, created_at, updated_at, record_json)
			 VALUES (?1, ?2, ?3, ?4, ?5)`
		)
			.bind(
				video.id,
				video.blobId,
				video.createdAt,
				video.updatedAt,
				JSON.stringify(video)
			)
			.run();
		return toStreamVideo(this.#binding, video);
	}

	private async createVideoFromFile(
		file: File,
		params: StoredUploadParams,
		source: StoredVideo["source"],
		url?: string
	): Promise<StreamVideo> {
		const blobId = await this.#blob.put(file.stream());
		const createdAt = nowISOString();
		const video: StoredVideo = {
			id: crypto.randomUUID(),
			blobId,
			filename: file.name || "upload.bin",
			contentType: file.type || "application/octet-stream",
			size: file.size,
			createdAt,
			updatedAt: createdAt,
			creator: params.creator,
			meta: params.meta,
			allowedOrigins: params.allowedOrigins,
			requireSignedURLs: params.requireSignedURLs,
			thumbnailTimestampPct: params.thumbnailTimestampPct,
			scheduledDeletion: params.scheduledDeletion,
			watermark: params.watermark,
			maxDurationSeconds: params.maxDurationSeconds,
			maxSizeBytes: params.maxSizeBytes,
			status: { state: "ready", pctComplete: "100" },
			source,
			url,
		};

		try {
			return await this.insertVideo(video);
		} catch (error) {
			await this.#blob.delete(blobId);
			throw error;
		}
	}

	async uploadUrl(
		url: string,
		params?: StreamUrlUploadParams
	): Promise<StreamVideo> {
		await this.ensureSchema();
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch upload URL: ${response.status}`);
		}
		const contentType =
			response.headers.get("content-type") ?? "application/octet-stream";
		const fileName = url.split("/").pop() || "remote-upload.bin";
		const file = new File([await response.arrayBuffer()], fileName, {
			type: contentType,
		});
		return this.createVideoFromFile(file, pickUploadParams(params), "url", url);
	}

	async getVideoRecord(videoId: string): Promise<StoredVideo | null> {
		await this.ensureSchema();
		const row = await this.env.STREAM_DB.prepare(
			"SELECT record_json FROM videos WHERE id = ?1"
		)
			.bind(videoId)
			.first<{ record_json: string }>();
		return row ? jsonParse<StoredVideo>(row.record_json) : null;
	}

	async listVideos(params?: StreamVideosListParams): Promise<StreamVideo[]> {
		await this.ensureSchema();
		const results = await this.env.STREAM_DB.prepare(
			"SELECT record_json FROM videos ORDER BY created_at ASC, id ASC"
		).all<{ record_json: string }>();
		let videos = (results.results ?? [])
			.map((row) => jsonParse<StoredVideo>(row.record_json))
			.sort((a, b) => {
				if (a.createdAt === b.createdAt) {
					return a.id.localeCompare(b.id);
				}
				return a.createdAt.localeCompare(b.createdAt);
			});

		if (params?.after) {
			const afterIndex = videos.findIndex((video) => video.id === params.after);
			videos = afterIndex === -1 ? [] : videos.slice(afterIndex + 1);
		}
		if (params?.before) {
			const beforeIndex = videos.findIndex(
				(video) => video.id === params.before
			);
			videos = beforeIndex === -1 ? [] : videos.slice(0, beforeIndex);
		}
		if (params?.limit !== undefined) {
			videos = videos.slice(0, params.limit);
		}
		return videos.map((video) => toStreamVideo(this.#binding, video));
	}

	async updateVideo(
		videoId: string,
		params: StreamUpdateVideoParams
	): Promise<StreamVideo> {
		await this.ensureSchema();
		const existing = await this.getVideoRecord(videoId);
		if (!existing) {
			throw new Error(`Video not found: ${videoId}`);
		}

		const update = pickUploadParams(params);
		const updated: StoredVideo = {
			...existing,
			updatedAt: nowISOString(),
			creator: update.creator ?? existing.creator,
			meta: update.meta ?? existing.meta,
			allowedOrigins: update.allowedOrigins ?? existing.allowedOrigins,
			requireSignedURLs: update.requireSignedURLs ?? existing.requireSignedURLs,
			thumbnailTimestampPct:
				update.thumbnailTimestampPct ?? existing.thumbnailTimestampPct,
			scheduledDeletion: update.scheduledDeletion ?? existing.scheduledDeletion,
			watermark: update.watermark ?? existing.watermark,
			maxDurationSeconds:
				update.maxDurationSeconds ?? existing.maxDurationSeconds,
			maxSizeBytes: update.maxSizeBytes ?? existing.maxSizeBytes,
		};

		await this.env.STREAM_DB.prepare(
			"UPDATE videos SET updated_at = ?2, record_json = ?3 WHERE id = ?1"
		)
			.bind(videoId, updated.updatedAt, JSON.stringify(updated))
			.run();
		return toStreamVideo(this.#binding, updated);
	}

	async deleteVideo(videoId: string): Promise<void> {
		await this.ensureSchema();
		const video = await this.getVideoRecord(videoId);
		if (!video) {
			return;
		}

		const captions = await this.env.STREAM_DB.prepare(
			"SELECT blob_id FROM captions WHERE video_id = ?1"
		)
			.bind(videoId)
			.all<{ blob_id: string | null }>();
		for (const caption of captions.results ?? []) {
			if (caption.blob_id) {
				await this.#blob.delete(caption.blob_id);
			}
		}

		await this.env.STREAM_DB.prepare("DELETE FROM captions WHERE video_id = ?1")
			.bind(videoId)
			.run();
		await this.env.STREAM_DB.prepare(
			"DELETE FROM direct_uploads WHERE video_id = ?1"
		)
			.bind(videoId)
			.run();
		await this.env.STREAM_DB.prepare("DELETE FROM videos WHERE id = ?1")
			.bind(videoId)
			.run();
		await this.#blob.delete(video.blobId);
	}

	async uploadCaption(videoId: string, language: string, file: File) {
		await this.ensureSchema();
		const existing = await this.env.STREAM_DB.prepare(
			"SELECT blob_id FROM captions WHERE video_id = ?1 AND language = ?2"
		)
			.bind(videoId, language)
			.first<{ blob_id: string | null }>();
		const now = nowISOString();
		const blobId = await this.#blob.put(file.stream());
		const caption: StoredCaption = {
			videoId,
			language,
			label: language.toUpperCase(),
			generated: false,
			status: "ready",
			blobId,
			createdAt: now,
			updatedAt: now,
		};
		try {
			await this.env.STREAM_DB.prepare(
				`INSERT OR REPLACE INTO captions (video_id, language, blob_id, record_json)
				 VALUES (?1, ?2, ?3, ?4)`
			)
				.bind(videoId, language, blobId, JSON.stringify(caption))
				.run();
		} catch (error) {
			await this.#blob.delete(blobId);
			throw error;
		}
		if (existing?.blob_id && existing.blob_id !== blobId) {
			await this.#blob.delete(existing.blob_id);
		}
		return toStreamCaption(caption);
	}

	async generateCaption(
		videoId: string,
		language: string
	): Promise<StreamCaption> {
		throw new Error(
			`Caption generation is not implemented in local Stream mode: ${videoId}/${language}`
		);
	}

	async listCaptions(videoId: string, language?: string) {
		await this.ensureSchema();
		if (language) {
			const row = await this.env.STREAM_DB.prepare(
				"SELECT record_json FROM captions WHERE video_id = ?1 AND language = ?2"
			)
				.bind(videoId, language)
				.first<{ record_json: string }>();
			return row
				? [toStreamCaption(jsonParse<StoredCaption>(row.record_json))]
				: [];
		}

		const rows = await this.env.STREAM_DB.prepare(
			"SELECT record_json FROM captions WHERE video_id = ?1 ORDER BY language ASC"
		)
			.bind(videoId)
			.all<{ record_json: string }>();
		return (rows.results ?? []).map((row) =>
			toStreamCaption(jsonParse<StoredCaption>(row.record_json))
		);
	}

	async deleteCaption(videoId: string, language: string): Promise<void> {
		await this.ensureSchema();
		const row = await this.env.STREAM_DB.prepare(
			"SELECT blob_id FROM captions WHERE video_id = ?1 AND language = ?2"
		)
			.bind(videoId, language)
			.first<{ blob_id: string | null }>();
		await this.env.STREAM_DB.prepare(
			"DELETE FROM captions WHERE video_id = ?1 AND language = ?2"
		)
			.bind(videoId, language)
			.run();
		if (row?.blob_id) {
			await this.#blob.delete(row.blob_id);
		}
	}

	async getCaptionBlob(
		videoId: string,
		language: string
	): Promise<ReadableStream<Uint8Array> | null> {
		await this.ensureSchema();
		const row = await this.env.STREAM_DB.prepare(
			"SELECT blob_id FROM captions WHERE video_id = ?1 AND language = ?2"
		)
			.bind(videoId, language)
			.first<{ blob_id: string | null }>();
		if (!row?.blob_id) {
			return null;
		}
		return this.#blob.get(
			row.blob_id
		) as Promise<ReadableStream<Uint8Array> | null>;
	}

	async createDirectUpload(
		params: StreamDirectUploadCreateParams
	): Promise<StreamDirectUpload> {
		await this.ensureSchema();
		const token = crypto.randomUUID();
		const videoId = crypto.randomUUID();
		const storedParams = pickUploadParams(params);
		const directUpload: StoredDirectUpload = {
			token,
			videoId,
			expiresAt: getOptionalString((params as Record<string, unknown>).expiry),
			params: storedParams,
		};
		await this.env.STREAM_DB.prepare(
			`INSERT INTO direct_uploads (token, video_id, expires_at, used_at, record_json)
			 VALUES (?1, ?2, ?3, ?4, ?5)`
		)
			.bind(
				token,
				videoId,
				directUpload.expiresAt ?? null,
				directUpload.usedAt ?? null,
				JSON.stringify(directUpload)
			)
			.run();

		return {
			uploadURL: `${baseRoute(this.#binding)}/direct-upload/${encodeURIComponent(token)}`,
			id: videoId,
			scheduledDeletion: storedParams.scheduledDeletion,
			watermark: storedParams.watermark
				? toStreamWatermark(storedParams.watermark)
				: undefined,
		} as StreamDirectUpload;
	}

	async handleDirectUpload(token: string, request: Request): Promise<Response> {
		await this.ensureSchema();
		if (request.method !== "POST" && request.method !== "PUT") {
			return new Response("Method not allowed", {
				status: 405,
				headers: { allow: "POST, PUT" },
			});
		}

		const row = await this.env.STREAM_DB.prepare(
			"SELECT record_json FROM direct_uploads WHERE token = ?1"
		)
			.bind(token)
			.first<{ record_json: string }>();
		if (!row) {
			return new Response("Unknown direct upload token", { status: 404 });
		}

		const directUpload = jsonParse<StoredDirectUpload>(row.record_json);
		if (directUpload.usedAt) {
			return new Response("Direct upload already used", { status: 409 });
		}
		if (
			directUpload.expiresAt !== undefined &&
			Date.parse(directUpload.expiresAt) < Date.now()
		) {
			return new Response("Direct upload expired", { status: 410 });
		}

		const claimedAt = nowISOString();
		const claim = await this.env.STREAM_DB.prepare(
			`UPDATE direct_uploads
			 SET used_at = ?2, record_json = ?3
			 WHERE token = ?1 AND used_at IS NULL`
		)
			.bind(
				token,
				claimedAt,
				JSON.stringify({ ...directUpload, usedAt: claimedAt })
			)
			.run();
		if ((claim.meta.changes ?? 0) === 0) {
			return new Response("Direct upload already used", { status: 409 });
		}

		let blobId: string | undefined;

		try {
			const contentType = request.headers.get("content-type") ?? "";
			let file: File;
			if (contentType.includes("multipart/form-data")) {
				const form = await request.formData();
				const formFile = form.get("file");
				if (!(formFile instanceof File)) {
					await this.env.STREAM_DB.prepare(
						`UPDATE direct_uploads
						 SET used_at = NULL, record_json = ?2
						 WHERE token = ?1`
					)
						.bind(token, JSON.stringify(directUpload))
						.run();
					return new Response('Expected multipart field "file"', {
						status: 400,
					});
				}
				file = formFile;
			} else {
				file = new File([await request.arrayBuffer()], "direct-upload.bin", {
					type: contentType || "application/octet-stream",
				});
			}

			blobId = await this.#blob.put(file.stream());
			const createdAt = nowISOString();
			const video: StoredVideo = {
				id: directUpload.videoId,
				blobId,
				filename: file.name,
				contentType: file.type || "application/octet-stream",
				size: file.size,
				createdAt,
				updatedAt: createdAt,
				creator: directUpload.params.creator,
				meta: directUpload.params.meta,
				allowedOrigins: directUpload.params.allowedOrigins,
				requireSignedURLs: directUpload.params.requireSignedURLs,
				thumbnailTimestampPct: directUpload.params.thumbnailTimestampPct,
				scheduledDeletion: directUpload.params.scheduledDeletion,
				watermark: directUpload.params.watermark,
				maxDurationSeconds: directUpload.params.maxDurationSeconds,
				maxSizeBytes: directUpload.params.maxSizeBytes,
				status: { state: "ready", pctComplete: "100" },
				source: "direct_upload",
			};
			await this.insertVideo(video);
			return Response.json({
				success: true,
				result: toStreamVideo(this.#binding, video),
			});
		} catch (error) {
			if (blobId) {
				await this.#blob.delete(blobId);
			}
			await this.env.STREAM_DB.prepare(
				`UPDATE direct_uploads
				 SET used_at = NULL, record_json = ?2
				 WHERE token = ?1`
			)
				.bind(token, JSON.stringify(directUpload))
				.run();
			throw error;
		}
	}

	async createWatermark(
		input: File | string,
		params: StreamWatermarkCreateParams
	): Promise<StreamWatermark> {
		await this.ensureSchema();
		const id = crypto.randomUUID();
		const createdAt = nowISOString();
		let watermark: StoredWatermark;

		if (typeof input === "string") {
			watermark = {
				id,
				name: params.name,
				createdAt,
				opacity: params.opacity,
				padding: params.padding,
				scale: params.scale,
				position: params.position,
				url: input,
			};
		} else {
			const blobId = await this.#blob.put(input.stream());
			watermark = {
				id,
				name: params.name,
				createdAt,
				opacity: params.opacity,
				padding: params.padding,
				scale: params.scale,
				position: params.position,
				fileName: input.name,
				contentType: input.type,
				blobId,
				url: `${baseRoute(this.#binding)}/watermarks/${encodeURIComponent(id)}`,
			};
		}

		await this.env.STREAM_DB.prepare(
			`INSERT INTO watermarks (id, blob_id, record_json)
			 VALUES (?1, ?2, ?3)`
		)
			.bind(id, watermark.blobId ?? null, JSON.stringify(watermark))
			.run();
		return toStreamWatermark(watermark);
	}

	async listWatermarks(): Promise<StreamWatermark[]> {
		await this.ensureSchema();
		const rows = await this.env.STREAM_DB.prepare(
			"SELECT record_json FROM watermarks ORDER BY id ASC"
		).all<{ record_json: string }>();
		return (rows.results ?? []).map((row) =>
			toStreamWatermark(jsonParse<StoredWatermark>(row.record_json))
		);
	}

	async getWatermark(id: string): Promise<StreamWatermark> {
		await this.ensureSchema();
		const record = await this.getWatermarkRecord(id);
		if (!record) {
			throw new Error(`Watermark not found: ${id}`);
		}
		return toStreamWatermark(record);
	}

	async getWatermarkRecord(id: string): Promise<StoredWatermark | null> {
		await this.ensureSchema();
		const row = await this.env.STREAM_DB.prepare(
			"SELECT record_json FROM watermarks WHERE id = ?1"
		)
			.bind(id)
			.first<{ record_json: string }>();
		return row ? jsonParse<StoredWatermark>(row.record_json) : null;
	}

	async deleteWatermark(id: string): Promise<void> {
		await this.ensureSchema();
		const row = await this.env.STREAM_DB.prepare(
			"SELECT blob_id FROM watermarks WHERE id = ?1"
		)
			.bind(id)
			.first<{ blob_id: string | null }>();
		await this.env.STREAM_DB.prepare("DELETE FROM watermarks WHERE id = ?1")
			.bind(id)
			.run();
		if (row?.blob_id) {
			await this.#blob.delete(row.blob_id);
		}
	}

	async getWatermarkBlob(
		id: string
	): Promise<ReadableStream<Uint8Array> | null> {
		await this.ensureSchema();
		const row = await this.env.STREAM_DB.prepare(
			"SELECT blob_id FROM watermarks WHERE id = ?1"
		)
			.bind(id)
			.first<{ blob_id: string | null }>();
		if (!row?.blob_id) {
			return null;
		}
		return this.#blob.get(
			row.blob_id
		) as Promise<ReadableStream<Uint8Array> | null>;
	}
}

type StoreFactory = () => StreamStore;

class StreamScopedDownloadsImpl
	extends RpcTarget
	implements StreamScopedDownloads
{
	constructor(
		private readonly binding: string,
		private readonly id: string,
		private readonly getStore: StoreFactory
	) {
		super();
	}

	async generate(
		_downloadType?: StreamDownloadType
	): Promise<StreamDownloadGetResponse> {
		throw new Error(
			`Downloads are not implemented in local Stream mode: ${this.binding}/${this.id}`
		);
	}

	async get(): Promise<StreamDownloadGetResponse> {
		throw new Error(
			`Downloads are not implemented in local Stream mode: ${this.binding}/${this.id}`
		);
	}

	async delete(_downloadType?: StreamDownloadType): Promise<void> {
		throw new Error(
			`Downloads are not implemented in local Stream mode: ${this.binding}/${this.id}`
		);
	}
}

class StreamScopedCaptionsImpl
	extends RpcTarget
	implements StreamScopedCaptions
{
	constructor(
		private readonly id: string,
		private readonly getStore: StoreFactory
	) {
		super();
	}

	async upload(language: string, file: File) {
		return this.getStore().uploadCaption(this.id, language, file);
	}

	async generate(language: string): Promise<StreamCaption> {
		return this.getStore().generateCaption(this.id, language);
	}

	async list(language?: string) {
		return this.getStore().listCaptions(this.id, language);
	}

	async delete(language: string) {
		await this.getStore().deleteCaption(this.id, language);
	}
}

class StreamVideoHandleImpl extends RpcTarget implements StreamVideoHandle {
	readonly downloads: StreamScopedDownloads;
	readonly captions: StreamScopedCaptions;

	constructor(
		readonly id: string,
		private readonly binding: string,
		private readonly getStore: StoreFactory
	) {
		super();
		this.downloads = new StreamScopedDownloadsImpl(binding, id, getStore);
		this.captions = new StreamScopedCaptionsImpl(id, getStore);
	}

	async details() {
		const video = await this.getStore().getVideoRecord(this.id);
		if (!video) {
			throw new Error(`Video not found: ${this.id}`);
		}
		return toStreamVideo(this.binding, video);
	}

	async update(params: StreamUpdateVideoParams) {
		return this.getStore().updateVideo(this.id, params);
	}

	async delete(): Promise<void> {
		await this.getStore().deleteVideo(this.id);
	}

	async generateToken(): Promise<string> {
		return btoa(JSON.stringify({ videoId: this.id, binding: this.binding }));
	}
}

class StreamVideosImpl extends RpcTarget implements StreamVideos {
	constructor(private readonly getStore: StoreFactory) {
		super();
	}

	async list(params?: StreamVideosListParams) {
		return this.getStore().listVideos(params);
	}
}

class StreamWatermarksImpl extends RpcTarget implements StreamWatermarks {
	constructor(private readonly getStore: StoreFactory) {
		super();
	}

	async generate(input: File | string, params: StreamWatermarkCreateParams) {
		return this.getStore().createWatermark(input, params);
	}

	async list() {
		return this.getStore().listWatermarks();
	}

	async get(watermarkId: string) {
		return this.getStore().getWatermark(watermarkId);
	}

	async delete(watermarkId: string): Promise<void> {
		await this.getStore().deleteWatermark(watermarkId);
	}
}

export class StreamBindingEntrypoint
	extends WorkerEntrypoint<Env>
	implements StreamBinding
{
	private getBindingName() {
		return this.env.STREAM_BINDING_NAME;
	}

	private getStore = () => new StreamStore(this.env, this.getBindingName());

	readonly videos = new StreamVideosImpl(this.getStore);
	readonly watermarks = new StreamWatermarksImpl(this.getStore);

	video(id: string): StreamVideoHandle {
		return new StreamVideoHandleImpl(id, this.getBindingName(), this.getStore);
	}

	async upload(file: File): Promise<StreamVideo>;
	async upload(
		url: string,
		params?: StreamUrlUploadParams
	): Promise<StreamVideo>;
	async upload(input: File | string, params?: StreamUrlUploadParams) {
		if (typeof input === "string") {
			return this.getStore().uploadUrl(input, params);
		} else {
			throw new Error("Not implemented");
		}
	}

	async createDirectUpload(params: StreamDirectUploadCreateParams) {
		return this.getStore().createDirectUpload(params);
	}

	async fetch(request: Request): Promise<Response> {
		const { pathname } = new URL(request.url);
		const store = this.getStore();

		const directUploadMatch = pathname.match(/^\/direct-upload\/([^/]+)$/);
		if (directUploadMatch) {
			return store.handleDirectUpload(
				decodeURIComponent(directUploadMatch[1]),
				request
			);
		}

		const captionMatch = pathname.match(
			/^\/videos\/([^/]+)\/captions\/([^/]+)\.vtt$/
		);
		if (captionMatch) {
			const body = await store.getCaptionBlob(
				decodeURIComponent(captionMatch[1]),
				decodeURIComponent(captionMatch[2])
			);
			if (!body) {
				return new Response("Not found", { status: 404 });
			}
			return new Response(body, {
				headers: { "content-type": "text/vtt; charset=utf-8" },
			});
		}

		const watermarkMatch = pathname.match(/^\/watermarks\/([^/]+)$/);
		if (watermarkMatch) {
			const watermarkId = decodeURIComponent(watermarkMatch[1]);
			const body = await store.getWatermarkBlob(watermarkId);
			const watermark = await store.getWatermarkRecord(watermarkId);
			if (!body || !watermark) {
				return new Response("Not found", { status: 404 });
			}
			return new Response(body, {
				headers: {
					"content-type": watermark.contentType || "application/octet-stream",
				},
			});
		}

		return new Response("Not found", { status: 404 });
	}
}

export default StreamBindingEntrypoint;
