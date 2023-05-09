import { HeadersInit, Response } from "../../http";
import { HttpError } from "../../shared";
import { CfHeader } from "../shared/constants";

enum Status {
	PayloadTooLarge = 413,
	RangeNotSatisfiable = 416,
	NotFound = 404,
	CacheMiss = 504,
}

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
		super(Status.PayloadTooLarge, "Cache storage failed");
	}
}

export class PurgeFailure extends CacheError {
	constructor() {
		super(Status.NotFound, "Couldn't find asset to purge");
	}
}

export class CacheMiss extends CacheError {
	constructor() {
		super(
			// workerd ignores this, but it's the correct status code
			Status.CacheMiss,
			"Asset not found in cache",
			[[CfHeader.CacheStatus, "MISS"]]
		);
	}
}

export class RangeNotSatisfiable extends CacheError {
	constructor(size: number) {
		super(Status.RangeNotSatisfiable, "Range not satisfiable", [
			["Content-Range", `bytes */${size}`],
			[CfHeader.CacheStatus, "HIT"],
		]);
	}
}
