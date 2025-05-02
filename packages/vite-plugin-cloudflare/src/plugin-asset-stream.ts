import { Transform } from "node:stream";
import { DeferredPromise } from "miniflare";
import type {
	OutgoingHttpHeader,
	OutgoingHttpHeaders,
	ServerResponse,
} from "node:http";

export class PluginAssetStream extends Transform {
	private headers: Headers = new Headers();
	public statusCode = 200;
	public statusMessage = "OK";
	public headersSent = false;
	public readonly ready = new DeferredPromise<void>();

	constructor(signal?: AbortSignal) {
		super({
			transform: (chunk, encoding, callback) => {
				this.push(chunk, encoding);
				callback();
			},
			final: (callback: (error?: Error | null) => void) => {
				this.ready.resolve();
				callback();
			},
			signal,
		});
	}

	getHeader(...args: Parameters<typeof ServerResponse.prototype.getHeader>) {
		const [name] = args;
		return this.headers.get(name);
	}

	setHeader(
		...args: Parameters<typeof ServerResponse.prototype.setHeader>
	): this {
		const [name, value] = args;
		if (Array.isArray(value)) {
			value.forEach(this.headers.set.bind(this.headers, name));
		} else {
			this.headers.set(name, String(value));
		}
		if ("content-length" === name.toLowerCase()) {
			this.ready.resolve();
		}
		return this;
	}

	writeHead(statusCode: number, ...argArray: any[]) {
		if (this.headersSent) {
			return this;
		}
		this.statusCode = statusCode;
		this.headersSent = true;
		try {
			let headers: OutgoingHttpHeaders | OutgoingHttpHeader[];
			if (typeof argArray[0] === "string") {
				this.statusMessage = argArray[0];
				headers = argArray[1];
			} else {
				headers = argArray[0];
			}
			if (typeof headers === "object") {
				if (Array.isArray(headers)) {
					for (let i = 0; i < headers.length; i += 2) {
						this.setHeader(String(headers[i]), headers[i + 1]!);
					}
				} else {
					for (const [key, value] of Object.entries(headers)) {
						this.setHeader(key, value!);
					}
				}
			}
			this.ready.resolve();
			return this;
		} catch (e) {
			this.ready.reject(e);
		}
	}
}
