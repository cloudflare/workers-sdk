import * as bAuthStripe from "@better-auth/stripe";
// Testing dependency with browser field mapping
// @see https://github.com/cloudflare/workers-sdk/issues/6581
import * as otel from "@microlabs/otel-cf-workers";
import * as bAuth from "better-auth";
// Testing dependency without a main entrypoint
// @see https://github.com/cloudflare/workers-sdk/issues/6591
import * as discord from "discord-api-types/v10";
import * as jose from "jose";
import nunjucks from "nunjucks";
import Stripe from "stripe";
import { Toucan } from "toucan-js";

export default {
	async fetch(): Promise<Response> {
		// Verify that we're able to import & create the toucan class. This is a library where `"module": "..."` is set, and `"type": "module"` is not
		const _ = new Toucan({
			dsn: "https://foo@sentry.com/123456",
		});
		const a = Stripe;

		nunjucks.configure({ autoescape: true });

		console.log(
			nunjucks.renderString("Hello {{ username }}", { username: "James" })
		);

		// Make sure none of the imports are tree shaken
		return new Response(
			JSON.stringify({
				discord,
				otel,
				jose,
				bAuth,
				bAuthStripe,
				a,
				n: nunjucks.renderString("Hello {{ username }}", { username: "James" }),
			})
		);
	},
};
