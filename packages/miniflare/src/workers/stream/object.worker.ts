import { DurableObject } from "cloudflare:workers";
import {
	all,
	BlobStore,
	createTypedSql,
	get,
	SharedBindings,
	Timers,
} from "miniflare:shared";
import { BadRequestError, InvalidURLError, NotFoundError } from "./errors";
import { SQL_SCHEMA } from "./schemas";
import type {
	CaptionRow,
	DownloadRow,
	VideoRow,
	WatermarkRow,
} from "./schemas";
import type { BlobId, TypedSql } from "miniflare:shared";

const BLOB_NAMESPACE = "stream-data";

interface Env {
	MINIFLARE_BLOBS?: Fetcher;
	MINIFLARE_STICKY_BLOBS?: boolean;
	[SharedBindings.MAYBE_JSON_ENABLE_CONTROL_ENDPOINTS]?: boolean;
}

export class StreamObject extends DurableObject<Env> {
	readonly timers = new Timers();
	readonly #blob: BlobStore;
	readonly #db: TypedSql;
	readonly #stmts: ReturnType<typeof sqlStmts>;

	#now() {
		return new Date(this.timers.now()).toISOString();
	}

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		const db = createTypedSql(state.storage);
		db.exec("PRAGMA foreign_keys = ON");
		db.exec(SQL_SCHEMA);
		this.#db = db;
		this.#stmts = sqlStmts(db, () => this.#now());
		const stickyBlobs = !!env.MINIFLARE_STICKY_BLOBS;
		this.#blob = new BlobStore(
			env.MINIFLARE_BLOBS as Fetcher,
			BLOB_NAMESPACE,
			stickyBlobs
		);
	}

	async createVideo(
		body: ReadableStream<Uint8Array> | null,
		params: StreamUrlUploadParams
	): Promise<VideoRow> {
		const id = crypto.randomUUID();
		const now = this.#now();

		let blobId: BlobId | null = null;
		let size = 0;

		if (body !== null) {
			// Count bytes while streaming through to blob storage
			const { readable, writable } = new TransformStream<
				Uint8Array,
				Uint8Array
			>({
				transform(chunk, controller) {
					size += chunk.byteLength;
					controller.enqueue(chunk);
				},
			});
			[blobId] = await Promise.all([
				this.#blob.put(readable),
				body.pipeTo(writable),
			]);
		}

		this.#stmts.insertVideo({
			id,
			creator: params.creator ?? null,
			meta: JSON.stringify(params.meta ?? {}),
			allowed_origins: JSON.stringify(params.allowedOrigins ?? []),
			require_signed_urls: params.requireSignedURLs ? 1 : 0,
			scheduled_deletion: params.scheduledDeletion ?? null,
			thumbnail_timestamp_pct: params.thumbnailTimestampPct ?? 0,
			created: now,
			modified: now,
			uploaded: body !== null ? now : null,
			status_state: body !== null ? "ready" : "pendingupload",
			ready_to_stream: body !== null ? 1 : 0,
			size,
			blob_id: blobId,
		});

		const row = get(this.#stmts.getVideo({ id }));
		if (row === undefined) throw new NotFoundError(`Video not found: ${id}`);
		return row;
	}

	async getVideo(id: string): Promise<VideoRow> {
		const row = get(this.#stmts.getVideo({ id }));
		if (row === undefined) throw new NotFoundError(`Video not found: ${id}`);
		return row;
	}

	async updateVideo(
		id: string,
		params: StreamUpdateVideoParams
	): Promise<VideoRow> {
		return this.#stmts.updateVideo(id, params);
	}

	async deleteVideo(id: string): Promise<void> {
		const blobIds = this.#stmts.deleteVideo(id);
		await Promise.all(blobIds.map((b) => this.#blob.delete(b)));
	}

	async listVideos(params?: StreamVideosListParams): Promise<VideoRow[]> {
		if (params?.before === undefined && params?.after === undefined) {
			if (params?.limit === undefined) {
				return all(this.#stmts.listVideos({}));
			}
			return all(this.#stmts.listVideosLimit({ limit: params.limit }));
		}

		const compToSql: Record<string, string> = {
			eq: "=",
			gt: ">",
			gte: ">=",
			lt: "<",
			lte: "<=",
		};
		const conditions: string[] = [];
		const values: (string | number)[] = [];

		if (params.before !== undefined) {
			const op = compToSql[params.beforeComp ?? "lt"];
			if (op === undefined) {
				throw new BadRequestError(
					"Invalid comparison operator: " + String(params.beforeComp)
				);
			}
			conditions.push("created " + op + " ?");
			values.push(params.before);
		}
		if (params.after !== undefined) {
			const op = compToSql[params.afterComp ?? "gte"];
			if (op === undefined) {
				throw new BadRequestError(
					"Invalid comparison operator: " + String(params.afterComp)
				);
			}
			conditions.push("created " + op + " ?");
			values.push(params.after);
		}

		values.push(params.limit ?? 1000);
		const sql =
			"SELECT * FROM _mf_stream_videos WHERE " +
			conditions.join(" AND ") +
			" ORDER BY created DESC LIMIT ?";
		return Array.from(this.#db.exec<VideoRow>(sql, ...values));
	}

	async generateToken(id: string): Promise<string> {
		const row = get(this.#stmts.getVideo({ id }));
		if (row === undefined) throw new NotFoundError(`Video not found: ${id}`);

		const payload = {
			sub: id,
			kid: "local-mode-key",
			exp: Math.floor(this.timers.now() / 1000) + 6 * 60 * 60,
		};
		return btoa(JSON.stringify(payload));
	}

	async generateCaption(
		videoId: string,
		language: string
	): Promise<CaptionRow> {
		const video = get(this.#stmts.getVideo({ id: videoId }));
		if (video === undefined)
			throw new NotFoundError(`Video not found: ${videoId}`);

		const label =
			new Intl.DisplayNames(["en"], { type: "language" }).of(language) ??
			language;

		this.#stmts.upsertCaption({
			video_id: videoId,
			language,
			generated: 1,
			label,
			status: "ready",
		});

		const row = get(this.#stmts.getCaption({ video_id: videoId, language }));
		if (row === undefined)
			throw new NotFoundError(`Caption not found: ${videoId}/${language}`);
		return row;
	}

	async listCaptions(
		videoId: string,
		language?: string
	): Promise<CaptionRow[]> {
		const video = get(this.#stmts.getVideo({ id: videoId }));
		if (video === undefined)
			throw new NotFoundError(`Video not found: ${videoId}`);

		if (language !== undefined) {
			const row = get(this.#stmts.getCaption({ video_id: videoId, language }));
			return row !== undefined ? [row] : [];
		}
		return all(this.#stmts.listCaptionsByVideo({ video_id: videoId }));
	}

	async deleteCaption(videoId: string, language: string): Promise<void> {
		const deleted = get(
			this.#stmts.deleteCaption({ video_id: videoId, language })
		);
		if (deleted === undefined) {
			throw new NotFoundError(`Caption not found: ${videoId}/${language}`);
		}
		if (deleted.blob_id !== null) {
			await this.#blob.delete(deleted.blob_id);
		}
	}

	async createWatermarkFromUrl(
		url: string,
		params: StreamWatermarkCreateParams
	): Promise<WatermarkRow> {
		const response = await fetch(url);
		if (!response.ok || response.body === null) {
			throw new InvalidURLError(
				`Failed to fetch watermark from URL: ${response.status} ${response.statusText}`
			);
		}

		return this.createWatermarkFromBody(
			await response.arrayBuffer(),
			url,
			params
		);
	}

	async createWatermarkFromBody(
		buffer: ArrayBuffer,
		downloadedFrom: string | null,
		params: StreamWatermarkCreateParams
	): Promise<WatermarkRow> {
		const size = buffer.byteLength;
		const blobId = await this.#blob.put(
			new Response(buffer).body as ReadableStream<Uint8Array>
		);

		const id = crypto.randomUUID();
		const now = this.#now();

		this.#stmts.insertWatermark({
			id,
			name: params.name ?? "",
			size,
			created: now,
			downloaded_from: downloadedFrom,
			opacity: params.opacity ?? 1.0,
			padding: params.padding ?? 0.05,
			scale: params.scale ?? 0.15,
			position: params.position ?? "upperRight",
			blob_id: blobId,
		});

		const row = get(this.#stmts.getWatermark({ id }));
		if (row === undefined)
			throw new NotFoundError(`Watermark not found: ${id}`);
		return row;
	}

	async getWatermark(id: string): Promise<WatermarkRow> {
		const row = get(this.#stmts.getWatermark({ id }));
		if (row === undefined)
			throw new NotFoundError(`Watermark not found: ${id}`);
		return row;
	}

	async listWatermarks(): Promise<WatermarkRow[]> {
		return all(this.#stmts.listWatermarks({}));
	}

	async deleteWatermark(id: string): Promise<void> {
		const deleted = get(this.#stmts.deleteWatermark({ id }));
		if (deleted === undefined)
			throw new NotFoundError(`Watermark not found: ${id}`);
		if (deleted.blob_id !== null) {
			await this.#blob.delete(deleted.blob_id);
		}
	}

	async generateDownload(
		videoId: string,
		downloadType: StreamDownloadType = "default"
	): Promise<DownloadRow[]> {
		const video = get(this.#stmts.getVideo({ id: videoId }));
		if (video === undefined)
			throw new NotFoundError(`Video not found: ${videoId}`);

		this.#stmts.upsertDownload({
			video_id: videoId,
			download_type: downloadType,
			status: "ready",
			percent_complete: 100.0,
		});

		return all(this.#stmts.listDownloads({ video_id: videoId }));
	}

	async listDownloads(videoId: string): Promise<DownloadRow[]> {
		const video = get(this.#stmts.getVideo({ id: videoId }));
		if (video === undefined)
			throw new NotFoundError(`Video not found: ${videoId}`);
		return all(this.#stmts.listDownloads({ video_id: videoId }));
	}

	async deleteDownload(
		videoId: string,
		downloadType: StreamDownloadType = "default"
	): Promise<void> {
		const deleted = get(
			this.#stmts.deleteDownload({
				video_id: videoId,
				download_type: downloadType,
			})
		);
		if (deleted === undefined) {
			throw new NotFoundError(`Download not found: ${videoId}/${downloadType}`);
		}
	}

	async fetch(
		req: Request<
			unknown,
			{ miniflare?: { controlOp?: { name: string; args?: unknown[] } } }
		>
	) {
		if (this.env[SharedBindings.MAYBE_JSON_ENABLE_CONTROL_ENDPOINTS] === true) {
			const controlOp = req.cf?.miniflare?.controlOp;
			if (controlOp !== undefined) {
				const args = controlOp.args ?? [];
				switch (controlOp.name) {
					case "enableFakeTimers":
						await this.timers.enableFakeTimers(args[0] as number);
						return Response.json(null);
					case "disableFakeTimers":
						await this.timers.disableFakeTimers();
						return Response.json(null);
					case "advanceFakeTime":
						await this.timers.advanceFakeTime(args[0] as number);
						return Response.json(null);
					case "waitForFakeTasks":
						await this.timers.waitForFakeTasks();
						return Response.json(null);
				}
			}
		}

		return new Response(null, { status: 404 });
	}
}

// Helper functions to return all db statements
function sqlStmts(db: TypedSql, now: () => string) {
	// Videos

	const stmtGetVideo = db.stmt<Pick<VideoRow, "id">, VideoRow>(
		"SELECT * FROM _mf_stream_videos WHERE id = :id"
	);

	const stmtInsertVideo = db.stmt<
		Pick<
			VideoRow,
			| "id"
			| "creator"
			| "meta"
			| "allowed_origins"
			| "require_signed_urls"
			| "scheduled_deletion"
			| "thumbnail_timestamp_pct"
			| "created"
			| "modified"
			| "uploaded"
			| "status_state"
			| "ready_to_stream"
			| "size"
			| "blob_id"
		>
	>(`INSERT INTO _mf_stream_videos (
		id, creator, meta, allowed_origins, require_signed_urls,
		scheduled_deletion, thumbnail_timestamp_pct, created, modified,
		uploaded, status_state, ready_to_stream, size, blob_id
	) VALUES (
		:id, :creator, :meta, :allowed_origins, :require_signed_urls,
		:scheduled_deletion, :thumbnail_timestamp_pct, :created, :modified,
		:uploaded, :status_state, :ready_to_stream, :size, :blob_id
	)`);

	const stmtUpdateVideo = db.stmt<
		Pick<
			VideoRow,
			| "id"
			| "modified"
			| "creator"
			| "meta"
			| "allowed_origins"
			| "require_signed_urls"
			| "scheduled_deletion"
			| "thumbnail_timestamp_pct"
			| "max_duration_seconds"
		>
	>(`UPDATE _mf_stream_videos SET
		modified = :modified,
		creator = :creator,
		meta = :meta,
		allowed_origins = :allowed_origins,
		require_signed_urls = :require_signed_urls,
		scheduled_deletion = :scheduled_deletion,
		thumbnail_timestamp_pct = :thumbnail_timestamp_pct,
		max_duration_seconds = :max_duration_seconds
	WHERE id = :id`);

	const stmtGetVideoCaptionBlobs = db.stmt<
		Pick<VideoRow, "id">,
		Pick<CaptionRow, "blob_id">
	>("SELECT blob_id FROM _mf_stream_captions WHERE video_id = :id");

	const stmtDeleteVideoDownloads = db.stmt<Pick<VideoRow, "id">>(
		"DELETE FROM _mf_stream_downloads WHERE video_id = :id"
	);

	const stmtDeleteVideo = db.stmt<
		Pick<VideoRow, "id">,
		Pick<VideoRow, "blob_id">
	>("DELETE FROM _mf_stream_videos WHERE id = :id RETURNING blob_id");

	const stmtListVideos = db.stmt<Record<string, never>, VideoRow>(
		"SELECT * FROM _mf_stream_videos ORDER BY created DESC"
	);

	const stmtListVideosLimit = db.stmt<{ limit: number }, VideoRow>(
		"SELECT * FROM _mf_stream_videos ORDER BY created DESC LIMIT :limit"
	);

	// Captions

	const stmtGetCaption = db.stmt<
		Pick<CaptionRow, "video_id" | "language">,
		CaptionRow
	>(
		"SELECT * FROM _mf_stream_captions WHERE video_id = :video_id AND language = :language"
	);

	const stmtUpsertCaption = db.stmt<
		Pick<CaptionRow, "video_id" | "language" | "generated" | "label" | "status">
	>(`INSERT INTO _mf_stream_captions (video_id, language, generated, label, status)
		VALUES (:video_id, :language, :generated, :label, :status)
		ON CONFLICT (video_id, language) DO UPDATE SET
			generated = excluded.generated,
			label = excluded.label,
			status = excluded.status`);

	const stmtListCaptionsByVideo = db.stmt<
		Pick<CaptionRow, "video_id">,
		CaptionRow
	>("SELECT * FROM _mf_stream_captions WHERE video_id = :video_id");

	const stmtDeleteCaption = db.stmt<
		Pick<CaptionRow, "video_id" | "language">,
		Pick<CaptionRow, "blob_id">
	>(
		"DELETE FROM _mf_stream_captions WHERE video_id = :video_id AND language = :language RETURNING blob_id"
	);

	// Watermarks

	const stmtGetWatermark = db.stmt<Pick<WatermarkRow, "id">, WatermarkRow>(
		"SELECT * FROM _mf_stream_watermarks WHERE id = :id"
	);

	const stmtInsertWatermark = db.stmt<
		Pick<
			WatermarkRow,
			| "id"
			| "name"
			| "size"
			| "created"
			| "downloaded_from"
			| "opacity"
			| "padding"
			| "scale"
			| "position"
			| "blob_id"
		>
	>(`INSERT INTO _mf_stream_watermarks
		(id, name, size, height, width, created, downloaded_from, opacity, padding, scale, position, blob_id)
		VALUES (:id, :name, :size, 0, 0, :created, :downloaded_from, :opacity, :padding, :scale, :position, :blob_id)`);

	const stmtListWatermarks = db.stmt<Record<string, never>, WatermarkRow>(
		"SELECT * FROM _mf_stream_watermarks ORDER BY created DESC"
	);

	const stmtDeleteWatermark = db.stmt<
		Pick<WatermarkRow, "id">,
		Pick<WatermarkRow, "blob_id">
	>("DELETE FROM _mf_stream_watermarks WHERE id = :id RETURNING blob_id");

	// Downloads

	const stmtUpsertDownload = db.stmt<
		Pick<
			DownloadRow,
			"video_id" | "download_type" | "status" | "percent_complete"
		>
	>(`INSERT INTO _mf_stream_downloads (video_id, download_type, status, percent_complete)
		VALUES (:video_id, :download_type, :status, :percent_complete)
		ON CONFLICT (video_id, download_type) DO UPDATE SET
			status = excluded.status,
			percent_complete = excluded.percent_complete`);

	const stmtListDownloads = db.stmt<Pick<DownloadRow, "video_id">, DownloadRow>(
		"SELECT * FROM _mf_stream_downloads WHERE video_id = :video_id"
	);

	const stmtDeleteDownload = db.stmt<
		Pick<DownloadRow, "video_id" | "download_type">,
		Pick<DownloadRow, "video_id">
	>(
		"DELETE FROM _mf_stream_downloads WHERE video_id = :video_id AND download_type = :download_type RETURNING video_id"
	);

	// Operations using transactions

	const deleteVideo = db.txn((id: string): BlobId[] => {
		// Collect caption blob_ids before CASCADE deletes rows
		const captionBlobs = all(stmtGetVideoCaptionBlobs({ id }))
			.map((r) => r.blob_id)
			.filter((b): b is BlobId => b !== null);

		stmtDeleteVideoDownloads({ id });

		const videoRow = get(stmtDeleteVideo({ id }));
		if (videoRow === undefined)
			throw new NotFoundError(`Video not found: ${id}`);

		const blobIds = captionBlobs;
		if (videoRow.blob_id !== null) blobIds.push(videoRow.blob_id);
		return blobIds;
	});

	const updateVideo = db.txn(
		(id: string, params: StreamUpdateVideoParams): VideoRow => {
			const current = get(stmtGetVideo({ id }));
			if (current === undefined)
				throw new NotFoundError(`Video not found: ${id}`);

			const nowValue = now();
			stmtUpdateVideo({
				id,
				modified: nowValue,
				creator:
					"creator" in params ? (params.creator ?? null) : current.creator,
				meta:
					params.meta !== undefined
						? JSON.stringify(params.meta)
						: current.meta,
				allowed_origins:
					params.allowedOrigins !== undefined
						? JSON.stringify(params.allowedOrigins)
						: current.allowed_origins,
				require_signed_urls:
					params.requireSignedURLs !== undefined
						? params.requireSignedURLs
							? 1
							: 0
						: current.require_signed_urls,
				scheduled_deletion:
					"scheduledDeletion" in params
						? (params.scheduledDeletion ?? null)
						: current.scheduled_deletion,
				thumbnail_timestamp_pct:
					params.thumbnailTimestampPct ?? current.thumbnail_timestamp_pct,
				max_duration_seconds:
					params.maxDurationSeconds ?? current.max_duration_seconds,
			});

			const updated = get(stmtGetVideo({ id }));
			if (updated === undefined)
				throw new NotFoundError(`Video not found: ${id}`);
			return updated;
		}
	);

	return {
		getVideo: stmtGetVideo,
		insertVideo: stmtInsertVideo,
		updateVideo,
		deleteVideo,
		listVideos: stmtListVideos,
		listVideosLimit: stmtListVideosLimit,
		getCaption: stmtGetCaption,
		upsertCaption: stmtUpsertCaption,
		listCaptionsByVideo: stmtListCaptionsByVideo,
		deleteCaption: stmtDeleteCaption,
		getWatermark: stmtGetWatermark,
		insertWatermark: stmtInsertWatermark,
		listWatermarks: stmtListWatermarks,
		deleteWatermark: stmtDeleteWatermark,
		upsertDownload: stmtUpsertDownload,
		listDownloads: stmtListDownloads,
		deleteDownload: stmtDeleteDownload,
	};
}
