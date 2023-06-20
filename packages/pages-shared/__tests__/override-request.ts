export class ExtendedRequest extends Request {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(input: string | Request, init?: any) {
		if (typeof input === "string" && !input.startsWith("http")) {
			const currentOrigin = "http://example.com";
			const fullURL = new URL(input, currentOrigin).toString();
			super(fullURL, init);
		} else {
			super(input, init);
		}
	}
}
