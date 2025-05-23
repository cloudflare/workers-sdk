import { IncomingMessage } from "node:http";
import { type Request } from "miniflare";

export class PluginAssetRequest extends IncomingMessage {
	constructor(request: Request) {
		super(undefined!);
		const { pathname, search } = new URL(request.url);
		this.url = `${pathname}${search}`;
		this.method = 'GET';
		const { headers, raw } = [...request.headers.entries()].reduce(
			(headers, [name, value]) => ({
				headers: {
					...headers.headers,
					[name.toLowerCase()]: value,
				},
				raw: [...headers.raw, name, value],
			}),
			{
				headers: {},
				raw: [] as string[],
			}
		);
		this.headers = headers;
		this.rawHeaders = raw;
	}
}
