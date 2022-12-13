import { HeadersInit, Response } from "../../http";
import { CfHeader } from "../shared/constants";

enum Status {
	PayloadTooLarge = 413,
	NotFound = 404,
	CacheMiss = 504,
}

export async function fallible<T>(promise: Promise<T>): Promise<T | Response> {
	try {
		return await promise;
	} catch (e) {
		if (e instanceof CacheError) {
			return e.toResponse();
		}
		throw e;
	}
}

export class CacheError extends Error {
	constructor(
		private status: number,
		message: string,
		readonly headers: HeadersInit = []
	) {
		super(message);
		this.name = "CacheError";
	}

	toResponse() {
		return new Response(null, {
			status: this.status,
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
