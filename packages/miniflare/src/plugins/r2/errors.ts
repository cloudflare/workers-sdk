import { Response } from "undici";
import { CfHeader } from "../shared/constants";
import { R2Object } from "./r2Object";

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
	InvalidDigest = 10014,
	InvalidObjectName = 10020,
	InvalidMaxKeys = 10022,
	InvalidArgument = 10029,
	PreconditionFailed = 10031,
	BadDigest = 10037,
	InvalidRange = 10039,
}

export class R2Error extends Error {
	status: number;
	v4Code: number;
	object?: R2Object;
	constructor(status: number, message: string, v4Code: number) {
		super(message);
		this.name = "R2Error";
		this.status = status;
		this.v4Code = v4Code;
	}

	toResponse() {
		if (this.object !== undefined) {
			const { metadataSize, value } = this.object.encode();
			return new Response(value, {
				status: this.status,
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
			status: this.status,
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

	attach(object: R2Object) {
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

export class InvalidDigest extends R2Error {
	constructor() {
		super(
			Status.BadRequest,
			"The Content-MD5 you specified is not valid.",
			CfCode.InvalidDigest
		);
	}
}

export class BadDigest extends R2Error {
	constructor() {
		super(
			Status.BadRequest,
			"The Content-MD5 you specified did not match what we received.",
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
