import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import { BadRequestError, InvalidURLError } from "./errors";
import {
	rowToStreamCaption,
	rowToStreamDownload,
	rowToStreamVideo,
	rowToStreamWatermark,
} from "./schemas";
import type { StreamObject } from "./object.worker";

interface Env {
	store: DurableObjectNamespace<StreamObject>;
}

function getStub(env: Env): DurableObjectStub<StreamObject> {
	const id = env.store.idFromName("stream-data");
	return env.store.get(id);
}

function rowsToDownloadResponse(
	rows: { type: StreamDownloadType; download: StreamDownload }[]
): StreamDownloadGetResponse {
	const result: StreamDownloadGetResponse = {};
	for (const { type, download } of rows) {
		result[type] = download;
	}
	return result;
}

export class StreamBinding extends WorkerEntrypoint<Env> {
	async upload(
		urlOrBody: string | ReadableStream<Uint8Array>,
		params?: StreamUrlUploadParams
	): Promise<StreamVideo> {
		let body: ReadableStream<Uint8Array>;
		if (typeof urlOrBody === "string") {
			const response = await fetch(urlOrBody);
			if (!response.ok || response.body === null) {
				throw new InvalidURLError(
					`Failed to fetch video from URL: ${response.status} ${response.statusText}`
				);
			}
			body = response.body;
		} else {
			body = urlOrBody;
		}
		const stub = getStub(this.env);
		const row = await stub.createVideo(body, params ?? {});
		return rowToStreamVideo(row);
	}

	// Not supported in local mode yet
	async createDirectUpload(
		_params: StreamDirectUploadCreateParams
	): Promise<StreamDirectUpload> {
		throw new BadRequestError(
			"createDirectUpload is not supported in local mode"
		);
	}

	video(id: string): StreamVideoHandle {
		return new StreamVideoHandleImpl(this.env, id);
	}

	get videos(): StreamVideos {
		return new StreamVideosImpl(this.env);
	}

	get watermarks(): StreamWatermarks {
		return new StreamWatermarksImpl(this.env);
	}
}

class StreamScopedCaptionsImpl
	extends RpcTarget
	implements StreamScopedCaptions
{
	readonly #env: Env;
	readonly #videoId: string;

	constructor(env: Env, videoId: string) {
		super();
		this.#env = env;
		this.#videoId = videoId;
	}

	async upload(
		_language: string,
		_input: ReadableStream
	): Promise<StreamCaption> {
		throw new BadRequestError("caption upload is not supported in local mode");
	}

	async generate(language: string): Promise<StreamCaption> {
		const stub = getStub(this.#env);
		const row = await stub.generateCaption(this.#videoId, language);
		return rowToStreamCaption(row);
	}

	async list(language?: string): Promise<StreamCaption[]> {
		const stub = getStub(this.#env);
		const rows = await stub.listCaptions(this.#videoId, language);
		return rows.map(rowToStreamCaption);
	}

	async delete(language: string): Promise<void> {
		const stub = getStub(this.#env);
		await stub.deleteCaption(this.#videoId, language);
	}
}

class StreamScopedDownloadsImpl
	extends RpcTarget
	implements StreamScopedDownloads
{
	readonly #env: Env;
	readonly #videoId: string;

	constructor(env: Env, videoId: string) {
		super();
		this.#env = env;
		this.#videoId = videoId;
	}

	async generate(
		downloadType: StreamDownloadType = "default"
	): Promise<StreamDownloadGetResponse> {
		const stub = getStub(this.#env);
		const rows = await stub.generateDownload(this.#videoId, downloadType);
		return rowsToDownloadResponse(rows.map(rowToStreamDownload));
	}

	async get(): Promise<StreamDownloadGetResponse> {
		const stub = getStub(this.#env);
		const rows = await stub.listDownloads(this.#videoId);
		return rowsToDownloadResponse(rows.map(rowToStreamDownload));
	}

	async delete(downloadType: StreamDownloadType = "default"): Promise<void> {
		const stub = getStub(this.#env);
		await stub.deleteDownload(this.#videoId, downloadType);
	}
}

class StreamVideoHandleImpl extends RpcTarget implements StreamVideoHandle {
	readonly id: string;
	readonly #env: Env;

	constructor(env: Env, id: string) {
		super();
		this.#env = env;
		this.id = id;
	}

	async details(): Promise<StreamVideo> {
		const stub = getStub(this.#env);
		const row = await stub.getVideo(this.id);
		return rowToStreamVideo(row);
	}

	async update(params: StreamUpdateVideoParams): Promise<StreamVideo> {
		const stub = getStub(this.#env);
		const row = await stub.updateVideo(this.id, params);
		return rowToStreamVideo(row);
	}

	async delete(): Promise<void> {
		const stub = getStub(this.#env);
		await stub.deleteVideo(this.id);
	}

	async generateToken(): Promise<string> {
		const stub = getStub(this.#env);
		return stub.generateToken(this.id);
	}

	get downloads(): StreamScopedDownloads {
		return new StreamScopedDownloadsImpl(this.#env, this.id);
	}

	get captions(): StreamScopedCaptions {
		return new StreamScopedCaptionsImpl(this.#env, this.id);
	}
}

class StreamVideosImpl extends RpcTarget implements StreamVideos {
	readonly #env: Env;

	constructor(env: Env) {
		super();
		this.#env = env;
	}

	async list(params?: StreamVideosListParams): Promise<StreamVideo[]> {
		const stub = getStub(this.#env);
		const rows = await stub.listVideos(params);
		return rows.map(rowToStreamVideo);
	}
}

class StreamWatermarksImpl extends RpcTarget implements StreamWatermarks {
	readonly #env: Env;

	constructor(env: Env) {
		super();
		this.#env = env;
	}

	async generate(
		streamOrUrl: ReadableStream | string,
		params: StreamWatermarkCreateParams
	): Promise<StreamWatermark> {
		if (
			params.opacity !== undefined &&
			(params.opacity < 0 || params.opacity > 1)
		) {
			throw new BadRequestError("opacity must be between 0.0 and 1.0");
		}
		if (
			params.padding !== undefined &&
			(params.padding < 0 || params.padding > 1)
		) {
			throw new BadRequestError("padding must be between 0.0 and 1.0");
		}
		if (params.scale !== undefined && (params.scale < 0 || params.scale > 1)) {
			throw new BadRequestError("scale must be between 0.0 and 1.0");
		}
		const stub = getStub(this.#env);
		if (typeof streamOrUrl === "string") {
			const row = await stub.createWatermarkFromUrl(streamOrUrl, params);
			return rowToStreamWatermark(row);
		}
		// ReadableStream — pre-fetched data passed directly
		const buffer = await new Response(streamOrUrl).arrayBuffer();
		const row = await stub.createWatermarkFromBody(buffer, null, params);
		return rowToStreamWatermark(row);
	}

	async list(): Promise<StreamWatermark[]> {
		const stub = getStub(this.#env);
		const rows = await stub.listWatermarks();
		return rows.map(rowToStreamWatermark);
	}

	async get(watermarkId: string): Promise<StreamWatermark> {
		const stub = getStub(this.#env);
		const row = await stub.getWatermark(watermarkId);
		return rowToStreamWatermark(row);
	}

	async delete(watermarkId: string): Promise<void> {
		const stub = getStub(this.#env);
		await stub.deleteWatermark(watermarkId);
	}
}
