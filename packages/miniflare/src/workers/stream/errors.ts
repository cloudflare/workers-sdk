export class StreamBindingError extends Error implements StreamError {
	constructor(
		message: string,
		readonly code: number,
		readonly statusCode: number
	) {
		super(message);
		this.name = "StreamBindingError";
	}
}

export class BadRequestError extends StreamBindingError {
	constructor(message = "Bad Request") {
		super(message, 10005, 400);
		this.name = "BadRequestError";
	}
}

export class NotFoundError extends StreamBindingError {
	constructor(message = "Not Found") {
		super(message, 10003, 404);
		this.name = "NotFoundError";
	}
}

export class InvalidURLError extends StreamBindingError {
	constructor(message = "Invalid URL") {
		super(message, 10010, 400);
		this.name = "InvalidURLError";
	}
}
