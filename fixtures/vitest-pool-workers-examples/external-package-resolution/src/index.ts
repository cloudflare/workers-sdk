import { Toucan } from "toucan-js";

export default {
	async fetch(): Promise<Response> {
		// Verify that we're able to import & create the toucan class. This is a library where `"module": "..."` is set, and `"type": "module"` is not
		const _ = new Toucan({
			dsn: "https://foo@sentry.com/123456",
		});

		return new Response("Hello World!");
	},
};
