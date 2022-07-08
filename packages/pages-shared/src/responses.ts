/// <reference types="@cloudflare/workers-types" />

function mergeHeaders(base: HeadersInit, extra: HeadersInit) {
	base = new Headers(base ?? {})
	extra = new Headers(extra ?? {})

	return new Headers({
		...Object.fromEntries(base.entries()),
		...Object.fromEntries(extra.entries()),
	})
}

export class OkResponse extends Response {
	constructor(...[body, init]: ConstructorParameters<typeof Response>) {
		super(body, {
			...init,
			status: 200,
			statusText: "OK",
		});
	}
}

export class NotModifiedResponse extends Response {
	constructor() {
		super(undefined, {
			status: 304,
			statusText: "Not Modified",
		});
	}
}

export class PermanentRedirectResponse extends Response {
	constructor(location: string, init?: ConstructorParameters<typeof Response>[1]) {
		super(undefined, {
			...init,
			status: 308,
			statusText: 'Permanent Redirect',
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			headers: mergeHeaders(init?.headers as any, {
				location,
			}),
		})
	}
}

export class NotFoundResponse extends Response {
	constructor(...[body, init]: ConstructorParameters<typeof Response>) {
		super(body, {
			...init,
			status: 404,
			statusText: 'Not Found',
		})
	}
}

export class MethodNotAllowedResponse extends Response {
	constructor(...[body, init]: ConstructorParameters<typeof Response>) {
		super(body, {
			...init,
			status: 405,
			statusText: 'Method Not Allowed',
		})
	}
}

export class NotAcceptableResponse extends Response {
	constructor(...[body, init]: ConstructorParameters<typeof Response>) {
		super(body, {
			...init,
			status: 406,
			statusText: 'Not Acceptable',
		})
	}
}

export class InternalServerErrorResponse extends Response {
	constructor(err: Error, init?: ConstructorParameters<typeof Response>[1]) {
		let body: string | undefined = undefined
		if ((globalThis as unknown as { DEBUG: boolean }).DEBUG) {
			body = `${err.message}\n\n${err.stack}`
		}

		super(body, {
			...init,
			status: 500,
			statusText: 'Internal Server Error',
		})
	}
}