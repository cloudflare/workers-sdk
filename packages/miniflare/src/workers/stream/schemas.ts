export const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS _mf_stream_videos (
  id                      TEXT PRIMARY KEY,
  creator                 TEXT,
  thumbnail               TEXT NOT NULL DEFAULT '',
  thumbnail_timestamp_pct REAL NOT NULL DEFAULT 0.0,
  ready_to_stream         INTEGER NOT NULL DEFAULT 1,
  ready_to_stream_at      TEXT,
  status_state            TEXT NOT NULL DEFAULT 'ready',
  status_pct_complete     TEXT,
  status_error_reason_code TEXT NOT NULL DEFAULT '',
  status_error_reason_text TEXT NOT NULL DEFAULT '',
  meta                    TEXT NOT NULL DEFAULT '{}',
  created                 TEXT NOT NULL,
  modified                TEXT NOT NULL,
  scheduled_deletion      TEXT,
  size                    INTEGER NOT NULL DEFAULT 0,
  allowed_origins         TEXT NOT NULL DEFAULT '[]',
  require_signed_urls     INTEGER,
  uploaded                TEXT,
  upload_expiry           TEXT,
  max_size_bytes          INTEGER,
  max_duration_seconds    INTEGER,
  duration                REAL NOT NULL DEFAULT -1.0,
  input_width             INTEGER NOT NULL DEFAULT 0,
  input_height            INTEGER NOT NULL DEFAULT 0,
  live_input_id           TEXT,
  clipped_from_id         TEXT,
  blob_id                 TEXT
);

CREATE TABLE IF NOT EXISTS _mf_stream_captions (
  video_id   TEXT NOT NULL,
  language   TEXT NOT NULL,
  generated  INTEGER NOT NULL DEFAULT 0,
  label      TEXT NOT NULL DEFAULT '',
  status     TEXT,
  blob_id    TEXT,
  PRIMARY KEY (video_id, language),
  FOREIGN KEY (video_id) REFERENCES _mf_stream_videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS _mf_stream_watermarks (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  size            INTEGER NOT NULL DEFAULT 0,
  height          INTEGER NOT NULL DEFAULT 0,
  width           INTEGER NOT NULL DEFAULT 0,
  created         TEXT NOT NULL,
  downloaded_from TEXT,
  opacity         REAL NOT NULL DEFAULT 1.0,
  padding         REAL NOT NULL DEFAULT 0.05,
  scale           REAL NOT NULL DEFAULT 0.15,
  position        TEXT NOT NULL DEFAULT 'upperRight',
  blob_id         TEXT
);

CREATE TABLE IF NOT EXISTS _mf_stream_downloads (
  video_id         TEXT NOT NULL,
  download_type    TEXT NOT NULL DEFAULT 'default',
  status           TEXT NOT NULL DEFAULT 'ready',
  percent_complete REAL NOT NULL DEFAULT 100.0,
  url              TEXT,
  PRIMARY KEY (video_id, download_type),
  FOREIGN KEY (video_id) REFERENCES _mf_stream_videos(id) ON DELETE CASCADE
);
`;

export type VideoRow = {
	id: string;
	creator: string | null;
	thumbnail: string;
	thumbnail_timestamp_pct: number;
	ready_to_stream: number;
	ready_to_stream_at: string | null;
	status_state: string;
	status_pct_complete: string | null;
	status_error_reason_code: string;
	status_error_reason_text: string;
	meta: string;
	created: string;
	modified: string;
	scheduled_deletion: string | null;
	size: number;
	allowed_origins: string;
	require_signed_urls: number | null;
	uploaded: string | null;
	upload_expiry: string | null;
	max_size_bytes: number | null;
	max_duration_seconds: number | null;
	duration: number;
	input_width: number;
	input_height: number;
	live_input_id: string | null;
	clipped_from_id: string | null;
	blob_id: string | null;
};

export type CaptionRow = {
	video_id: string;
	language: string;
	generated: number;
	label: string;
	status: string | null;
	blob_id: string | null;
};

export type WatermarkRow = {
	id: string;
	name: string;
	size: number;
	height: number;
	width: number;
	created: string;
	downloaded_from: string | null;
	opacity: number;
	padding: number;
	scale: number;
	position: string;
	blob_id: string | null;
};

export type DownloadRow = {
	video_id: string;
	download_type: StreamDownloadType;
	status: string;
	percent_complete: number;
	url: string | null;
};

export function rowToStreamVideo(row: VideoRow): StreamVideo {
	const baseUrl = `https://customer-placeholder.cloudflarestream.com/${row.id}`;
	return {
		id: row.id,
		creator: row.creator,
		thumbnail: row.thumbnail || `${baseUrl}/thumbnails/thumbnail.jpg`,
		thumbnailTimestampPct: row.thumbnail_timestamp_pct,
		readyToStream: row.ready_to_stream === 1,
		readyToStreamAt: row.ready_to_stream_at,
		status: {
			state: row.status_state,
			pctComplete: row.status_pct_complete ?? undefined,
			errorReasonCode: row.status_error_reason_code,
			errorReasonText: row.status_error_reason_text,
		},
		meta: JSON.parse(row.meta) as Record<string, string>,
		created: row.created,
		modified: row.modified,
		scheduledDeletion: row.scheduled_deletion,
		size: row.size,
		preview: `${baseUrl}/watch`,
		allowedOrigins: JSON.parse(row.allowed_origins) as string[],
		requireSignedURLs:
			row.require_signed_urls === null ? null : row.require_signed_urls === 1,
		uploaded: row.uploaded,
		uploadExpiry: row.upload_expiry,
		maxSizeBytes: row.max_size_bytes,
		maxDurationSeconds: row.max_duration_seconds,
		duration: row.duration,
		input: { width: row.input_width, height: row.input_height },
		hlsPlaybackUrl: `${baseUrl}/manifest/video.m3u8`,
		dashPlaybackUrl: `${baseUrl}/manifest/video.mpd`,
		watermark: null,
		liveInputId: row.live_input_id,
		clippedFromId: row.clipped_from_id,
		publicDetails: null,
	};
}

export function rowToStreamCaption(row: CaptionRow): StreamCaption {
	return {
		language: row.language,
		label: row.label || row.language,
		generated: row.generated === 1,
		status: row.status as StreamCaption["status"],
	};
}

export function rowToStreamWatermark(row: WatermarkRow): StreamWatermark {
	return {
		id: row.id,
		name: row.name,
		size: row.size,
		height: row.height,
		width: row.width,
		created: row.created,
		downloadedFrom: row.downloaded_from,
		opacity: row.opacity,
		padding: row.padding,
		scale: row.scale,
		position: row.position as StreamWatermarkPosition,
	};
}

export function rowToStreamDownload(row: DownloadRow): {
	type: StreamDownloadType;
	download: StreamDownload;
} {
	return {
		type: row.download_type,
		download: {
			percentComplete: row.percent_complete,
			status: row.status as StreamDownloadStatus,
			url: row.url ?? undefined,
		},
	};
}
