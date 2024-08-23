export class OkResponse extends Response {
	constructor(body: BodyInit | null, init?: ResponseInit) {
		super(body, {
			...init,
			status: 200,
		});
	}
}

export class NotFoundResponse extends Response {
	constructor(...[body, init]: ConstructorParameters<typeof Response>) {
		super(body, {
			...init,
			status: 404,
			statusText: "Not Found",
		});
	}
}

export class MethodNotAllowedResponse extends Response {
	constructor(...[body, init]: ConstructorParameters<typeof Response>) {
		super(body, {
			...init,
			status: 405,
			statusText: "Method Not Allowed",
		});
	}
}

export class InternalServerErrorResponse extends Response {
	constructor(err: Error, init?: ResponseInit) {
		super(undefined, {
			...init,
			status: 500,
		});
	}
}

export class NotModifiedResponse extends Response {
	constructor(...[_body, _init]: ConstructorParameters<typeof Response>) {
		super(undefined, {
			status: 304,
			statusText: "Not Modified",
		});
	}
}
