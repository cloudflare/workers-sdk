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
		super(null, {
			...init,
			status: 500,
		});
	}
}

export class NotModifiedResponse extends Response {
	constructor(...[_body, init]: ConstructorParameters<typeof Response>) {
		super(null, {
			...init,
			status: 304,
			statusText: "Not Modified",
		});
	}
}

export class MovedPermanentlyResponse extends Response {
	constructor(location: string, init?: ResponseInit) {
		super(null, {
			...init,
			status: 301,
			statusText: "Moved Permanently",
			headers: {
				...init?.headers,
				Location: location,
			},
		});
	}
}

export class FoundResponse extends Response {
	constructor(location: string, init?: ResponseInit) {
		super(null, {
			...init,
			status: 302,
			statusText: "Found",
			headers: {
				...init?.headers,
				Location: location,
			},
		});
	}
}

export class SeeOtherResponse extends Response {
	constructor(location: string, init?: ResponseInit) {
		super(null, {
			...init,
			status: 303,
			statusText: "See Other",
			headers: {
				...init?.headers,
				Location: location,
			},
		});
	}
}

export class TemporaryRedirectResponse extends Response {
	constructor(location: string, init?: ResponseInit) {
		super(null, {
			...init,
			status: 307,
			statusText: "Temporary Redirect",
			headers: {
				...init?.headers,
				Location: location,
			},
		});
	}
}

export class PermanentRedirectResponse extends Response {
	constructor(location: string, init?: ResponseInit) {
		super(null, {
			...init,
			status: 308,
			statusText: "Permanent Redirect",
			headers: {
				...init?.headers,
				Location: location,
			},
		});
	}
}
