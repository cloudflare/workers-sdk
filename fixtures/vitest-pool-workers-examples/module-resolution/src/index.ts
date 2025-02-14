import { Toucan } from "toucan-js";
// Testing dependency without a main entrypoint
// @see https://github.com/cloudflare/workers-sdk/issues/6591
import "discord-api-types/v10";
// Testing dependency with browser field mapping
// @see https://github.com/cloudflare/workers-sdk/issues/6581
import "@microlabs/otel-cf-workers";

export default {
	async fetch(): Promise<Response> {
		// Verify that we're able to import & create the toucan class. This is a library where `"module": "..."` is set, and `"type": "module"` is not
		const _ = new Toucan({
			dsn: "https://foo@sentry.com/123456",
		});

		return new Response("Hello World!");
	},
};
