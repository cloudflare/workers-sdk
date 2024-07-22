export class NotFoundResponse extends Response {
	constructor() {
		super(null, {
			status: 404,
		});
	}
}

export class MethodNotAllowedResponse extends Response {
	constructor() {
		super(null, {
			status: 405,
		});
	}
}

export class OkResponse extends Response {
	constructor(body: BodyInit | null, init?: ResponseInit) {
		super(body, {
			...init,
			status: 200,
		});
	}
}

export class InternalServerErrorResponse extends Response {
	constructor(err: Error, init?: ResponseInit) {
		let body: string | undefined = undefined;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((globalThis as any).DEBUG) {
			body = `${err.message}\n\n${err.stack}`;
		}

		super(body, {
			...init,
			status: 500,
		});
	}
}
