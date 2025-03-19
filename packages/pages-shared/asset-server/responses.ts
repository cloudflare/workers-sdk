type HeadersInit = ConstructorParameters<typeof Headers>[0];

function mergeHeaders(base: HeadersInit, extra: HeadersInit) {
	const baseHeaders = new Headers(base ?? {});
	const extraHeaders = new Headers(extra ?? {});

	return new Headers({
		...Object.fromEntries(baseHeaders.entries()),
		...Object.fromEntries(extraHeaders.entries()),
	});
}

export function stripLeadingDoubleSlashes(location: string) {
	return location.replace(/^(\/|%2F|%2f|%5C|%5c|%09|\s|\\)+(.*)/, "/$2");
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

export class MovedPermanentlyResponse extends Response {
	constructor(
		location: string,
		init?: ConstructorParameters<typeof Response>[1],
		{
			preventLeadingDoubleSlash = true,
		}: { preventLeadingDoubleSlash: boolean } = {
			preventLeadingDoubleSlash: true,
		}
	) {
		location = preventLeadingDoubleSlash
			? stripLeadingDoubleSlashes(location)
			: location;
		super(`Redirecting to ${location}`, {
			...init,
			status: 301,
			statusText: "Moved Permanently",
			headers: mergeHeaders(init?.headers, {
				location,
			}),
		});
	}
}

export class FoundResponse extends Response {
	constructor(
		location: string,
		init?: ConstructorParameters<typeof Response>[1],
		{
			preventLeadingDoubleSlash = true,
		}: { preventLeadingDoubleSlash: boolean } = {
			preventLeadingDoubleSlash: true,
		}
	) {
		location = preventLeadingDoubleSlash
			? stripLeadingDoubleSlashes(location)
			: location;
		super(`Redirecting to ${location}`, {
			...init,
			status: 302,
			statusText: "Found",
			headers: mergeHeaders(init?.headers, {
				location,
			}),
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

export class PermanentRedirectResponse extends Response {
	constructor(
		location: string,
		init?: ConstructorParameters<typeof Response>[1],
		{
			preventLeadingDoubleSlash = true,
		}: { preventLeadingDoubleSlash: boolean } = {
			preventLeadingDoubleSlash: true,
		}
	) {
		location = preventLeadingDoubleSlash
			? stripLeadingDoubleSlashes(location)
			: location;
		super(undefined, {
			...init,
			status: 308,
			statusText: "Permanent Redirect",
			headers: mergeHeaders(init?.headers, {
				location,
			}),
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

export class NotAcceptableResponse extends Response {
	constructor(...[body, init]: ConstructorParameters<typeof Response>) {
		super(body, {
			...init,
			status: 406,
			statusText: "Not Acceptable",
		});
	}
}

export class InternalServerErrorResponse extends Response {
	constructor(err: Error, init?: ConstructorParameters<typeof Response>[1]) {
		let body: string | undefined = undefined;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((globalThis as any).DEBUG) {
			body = `${err.message}\n\n${err.stack}`;
		}

		super(body, {
			...init,
			status: 500,
			statusText: "Internal Server Error",
		});
	}
}

export class SeeOtherResponse extends Response {
	constructor(
		location: string,
		init?: ConstructorParameters<typeof Response>[1],
		{
			preventLeadingDoubleSlash = true,
		}: { preventLeadingDoubleSlash: boolean } = {
			preventLeadingDoubleSlash: true,
		}
	) {
		location = preventLeadingDoubleSlash
			? stripLeadingDoubleSlashes(location)
			: location;
		super(`Redirecting to ${location}`, {
			...init,
			status: 303,
			statusText: "See Other",
			headers: mergeHeaders(init?.headers, { location }),
		});
	}
}

export class TemporaryRedirectResponse extends Response {
	constructor(
		location: string,
		init?: ConstructorParameters<typeof Response>[1],
		{
			preventLeadingDoubleSlash = true,
		}: { preventLeadingDoubleSlash: boolean } = {
			preventLeadingDoubleSlash: true,
		}
	) {
		location = preventLeadingDoubleSlash
			? stripLeadingDoubleSlashes(location)
			: location;
		super(`Redirecting to ${location}`, {
			...init,
			status: 307,
			statusText: "Temporary Redirect",
			headers: mergeHeaders(init?.headers, { location }),
		});
	}
}
