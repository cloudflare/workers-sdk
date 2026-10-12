import { LogLevel, SharedHeaders } from "miniflare:shared";

export function logEmailToLoopback(
	loopback: Fetcher,
	message: string,
	level: LogLevel = LogLevel.INFO
): Promise<Response> {
	return loopback.fetch("http://localhost/core/log", {
		method: "POST",
		headers: { [SharedHeaders.LOG_LEVEL]: level.toString() },
		body: message,
	});
}

export function storeEmailTempFile(
	loopback: Fetcher,
	content: string | ArrayBuffer | ArrayBufferView,
	options: {
		extension: string;
		prefix: string;
		id: string;
	}
): Promise<Response> {
	let body: string | Uint8Array;
	if (typeof content === "string") {
		body = content;
	} else if (content instanceof ArrayBuffer) {
		body = new Uint8Array(content);
	} else {
		body = new Uint8Array(
			content.buffer,
			content.byteOffset,
			content.byteLength
		);
	}

	const params = new URLSearchParams(options);
	return loopback.fetch(
		`http://localhost/core/store-temp-file?${params.toString()}`,
		{
			method: "POST",
			body,
		}
	);
}
