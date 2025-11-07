import { HttpError } from "miniflare:shared";

import { CacheHeaders } from "./constants";

export class CacheError extends HttpError {
	constructor(
		code: number,
		message: string,
		readonly headers: HeadersInit = []
	) {
		super(code, message);
	}

	toResponse() {
		return new Response(null, {
			status: this.code,
			headers: this.headers,
		});
	}

	context(info: string) {
		this.message += ` (${info})`;
		return this;
	}
}

export class StorageFailure extends CacheError {
	constructor() {
		super(413, "Cache storage failed");
	}
}

export class PurgeFailure extends CacheError {
	constructor() {
		super(404, "Couldn't find asset to purge");
	}
}

export class CacheMiss extends CacheError {
	constructor() {
		super(
			// workerd ignores this, but it's the correct status code
			504,
			"Asset not found in cache",
			[[CacheHeaders.STATUS, "MISS"]]
		);
	}
}

export class RangeNotSatisfiable extends CacheError {
	constructor(size: number) {
		super(416, "Range not satisfiable", [
			["Content-Range", `bytes */${size}`],
			[CacheHeaders.STATUS, "HIT"],
		]);
	}
}
