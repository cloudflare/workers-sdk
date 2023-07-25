import { Response } from "../../http";
import { HttpError } from "../../shared";
import { CfHeader } from "../shared/constants";
import { InternalR2Object } from "./r2Object";

enum Status {
	BadRequest = 400,
	NotFound = 404,
	PreconditionFailed = 412,
	RangeNotSatisfiable = 416,
	InternalError = 500,
}
enum CfCode {
	InternalError = 10001,
	NoSuchObjectKey = 10007,
	EntityTooLarge = 100100,
	EntityTooSmall = 10011,
	MetadataTooLarge = 10012,
	InvalidObjectName = 10020,
	InvalidMaxKeys = 10022,
	NoSuchUpload = 10024,
	InvalidPart = 10025,
	InvalidArgument = 10029,
	PreconditionFailed = 10031,
	BadDigest = 10037,
	InvalidRange = 10039,
	BadUpload = 10048,
}

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
					[CfHeader.MetadataSize]: `${metadataSize}`,
					"Content-Type": "application/json",
					[CfHeader.Error]: JSON.stringify({
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
				[CfHeader.Error]: JSON.stringify({
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
		super(
			Status.BadRequest,
			"Metadata missing or invalid",
			CfCode.InvalidArgument
		);
	}
}

export class InternalError extends R2Error {
	constructor() {
		super(
			Status.InternalError,
			"We encountered an internal error. Please try again.",
			CfCode.InternalError
		);
	}
}
export class NoSuchKey extends R2Error {
	constructor() {
		super(
			Status.NotFound,
			"The specified key does not exist.",
			CfCode.NoSuchObjectKey
		);
	}
}

export class EntityTooLarge extends R2Error {
	constructor() {
		super(
			Status.BadRequest,
			"Your proposed upload exceeds the maximum allowed object size.",
			CfCode.EntityTooLarge
		);
	}
}

export class EntityTooSmall extends R2Error {
	constructor() {
		super(
			Status.BadRequest,
			"Your proposed upload is smaller than the minimum allowed object size.",
			CfCode.EntityTooSmall
		);
	}
}

export class MetadataTooLarge extends R2Error {
	constructor() {
		super(
			Status.BadRequest,
			"Your metadata headers exceed the maximum allowed metadata size.",
			CfCode.MetadataTooLarge
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
			Status.BadRequest,
			[
				`The ${algorithm} checksum you specified did not match what we received.`,
				`You provided a ${algorithm} checksum with value: ${provided.toString(
					"hex"
				)}`,
				`Actual ${algorithm} was: ${calculated.toString("hex")}`,
			].join("\n"),
			CfCode.BadDigest
		);
	}
}

export class InvalidObjectName extends R2Error {
	constructor() {
		super(
			Status.BadRequest,
			"The specified object name is not valid.",
			CfCode.InvalidObjectName
		);
	}
}

export class InvalidMaxKeys extends R2Error {
	constructor() {
		super(
			Status.BadRequest,
			"MaxKeys params must be positive integer <= 1000.",
			CfCode.InvalidMaxKeys
		);
	}
}

export class NoSuchUpload extends R2Error {
	constructor() {
		super(
			Status.BadRequest,
			"The specified multipart upload does not exist.",
			CfCode.NoSuchUpload
		);
	}
}

export class InvalidPart extends R2Error {
	constructor() {
		super(
			Status.BadRequest,
			"One or more of the specified parts could not be found.",
			CfCode.InvalidPart
		);
	}
}

export class PreconditionFailed extends R2Error {
	constructor() {
		super(
			Status.PreconditionFailed,
			"At least one of the pre-conditions you specified did not hold.",
			CfCode.PreconditionFailed
		);
	}
}

export class InvalidRange extends R2Error {
	constructor() {
		super(
			Status.RangeNotSatisfiable,
			"The requested range is not satisfiable",
			CfCode.InvalidRange
		);
	}
}

export class BadUpload extends R2Error {
	constructor() {
		super(
			Status.RangeNotSatisfiable,
			"There was a problem with the multipart upload.",
			CfCode.BadUpload
		);
	}
}
