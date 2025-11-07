import { HttpError } from "miniflare:shared";
import { Buffer } from "node:buffer";

import { R2Headers } from "./constants";
import { InternalR2Object } from "./r2Object.worker";

const R2ErrorCode = {
	INTERNAL_ERROR: 10001,
	NO_SUCH_OBJECT_KEY: 10007,
	ENTITY_TOO_LARGE: 100100,
	ENTITY_TOO_SMALL: 10011,
	METADATA_TOO_LARGE: 10012,
	INVALID_OBJECT_NAME: 10020,
	INVALID_MAX_KEYS: 10022,
	NO_SUCH_UPLOAD: 10024,
	INVALID_PART: 10025,
	INVALID_ARGUMENT: 10029,
	PRECONDITION_FAILED: 10031,
	BAD_DIGEST: 10037,
	INVALID_RANGE: 10039,
	BAD_UPLOAD: 10048,
} as const;

export class R2Error extends HttpError {
	object?: InternalR2Object;

	constructor(
		code: number,
		message: string,
		readonly v4Code: number
	) {
		super(code, message);
	}

	toResponse() {
		if (this.object !== undefined) {
			const { metadataSize, value } = this.object.encode();
			return new Response(value, {
				status: this.code,
				headers: {
					[R2Headers.METADATA_SIZE]: `${metadataSize}`,
					"Content-Type": "application/json",
					[R2Headers.ERROR]: JSON.stringify({
						message: this.message,
						version: 1,
						// Note the lowercase 'c', which the runtime expects
						v4code: this.v4Code,
					}),
				},
			});
		}
		return new Response(null, {
			status: this.code,
			headers: {
				[R2Headers.ERROR]: JSON.stringify({
					message: this.message,
					version: 1,
					// Note the lowercase 'c', which the runtime expects
					v4code: this.v4Code,
				}),
			},
		});
	}

	context(info: string) {
		this.message += ` (${info})`;
		return this;
	}

	attach(object: InternalR2Object) {
		this.object = object;
		return this;
	}
}

export class InvalidMetadata extends R2Error {
	constructor() {
		super(400, "Metadata missing or invalid", R2ErrorCode.INVALID_ARGUMENT);
	}
}

export class InternalError extends R2Error {
	constructor() {
		super(
			500,
			"We encountered an internal error. Please try again.",
			R2ErrorCode.INTERNAL_ERROR
		);
	}
}
export class NoSuchKey extends R2Error {
	constructor() {
		super(
			404,
			"The specified key does not exist.",
			R2ErrorCode.NO_SUCH_OBJECT_KEY
		);
	}
}

export class EntityTooLarge extends R2Error {
	constructor() {
		super(
			400,
			"Your proposed upload exceeds the maximum allowed object size.",
			R2ErrorCode.ENTITY_TOO_LARGE
		);
	}
}

export class EntityTooSmall extends R2Error {
	constructor() {
		super(
			400,
			"Your proposed upload is smaller than the minimum allowed object size.",
			R2ErrorCode.ENTITY_TOO_SMALL
		);
	}
}

export class MetadataTooLarge extends R2Error {
	constructor() {
		super(
			400,
			"Your metadata headers exceed the maximum allowed metadata size.",
			R2ErrorCode.METADATA_TOO_LARGE
		);
	}
}

export class BadDigest extends R2Error {
	constructor(
		algorithm: "MD5" | "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512",
		provided: Buffer,
		calculated: Buffer
	) {
		super(
			400,
			[
				`The ${algorithm} checksum you specified did not match what we received.`,
				`You provided a ${algorithm} checksum with value: ${provided.toString(
					"hex"
				)}`,
				`Actual ${algorithm} was: ${calculated.toString("hex")}`,
			].join("\n"),
			R2ErrorCode.BAD_DIGEST
		);
	}
}

export class InvalidObjectName extends R2Error {
	constructor() {
		super(
			400,
			"The specified object name is not valid.",
			R2ErrorCode.INVALID_OBJECT_NAME
		);
	}
}

export class InvalidMaxKeys extends R2Error {
	constructor() {
		super(
			400,
			"MaxKeys params must be positive integer <= 1000.",
			R2ErrorCode.INVALID_MAX_KEYS
		);
	}
}

export class NoSuchUpload extends R2Error {
	constructor() {
		super(
			400,
			"The specified multipart upload does not exist.",
			R2ErrorCode.NO_SUCH_UPLOAD
		);
	}
}

export class InvalidPart extends R2Error {
	constructor() {
		super(
			400,
			"One or more of the specified parts could not be found.",
			R2ErrorCode.INVALID_PART
		);
	}
}

export class PreconditionFailed extends R2Error {
	constructor() {
		super(
			412,
			"At least one of the pre-conditions you specified did not hold.",
			R2ErrorCode.PRECONDITION_FAILED
		);
	}
}

export class InvalidRange extends R2Error {
	constructor() {
		super(
			416,
			"The requested range is not satisfiable",
			R2ErrorCode.INVALID_RANGE
		);
	}
}

export class BadUpload extends R2Error {
	constructor() {
		super(
			500,
			"There was a problem with the multipart upload.",
			R2ErrorCode.BAD_UPLOAD
		);
	}
}
