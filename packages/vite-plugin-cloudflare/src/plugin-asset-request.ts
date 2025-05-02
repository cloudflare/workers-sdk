import { IncomingMessage } from "node:http";

export class PluginAssetRequest extends IncomingMessage {

	constructor(request: Request) {
		super(undefined!);
		const { pathname, search } = new URL(request.url);
		this.url = `${pathname}${search}`;
		this.method = "GET";
		this.headers = Object.fromEntries(request.headers.entries());
	}
}
