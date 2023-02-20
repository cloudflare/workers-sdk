import path from "path";
import Stripe from "stripe";

// `@cloudflare/workers-types` conflicts with `@types/node`, so we can't include
// it in the `tsconfig.json` `types` array
import type { Response as WorkerResponse } from "@cloudflare/workers-types";
declare global {
	const Response: typeof WorkerResponse;
}

export const onRequest = () => {
	// make sure path actually works
	return new Response(
		JSON.stringify({
			PATH: path.join("path/to", "some-file"),
			STRIPE_OBJECT: Stripe.toString(),
		})
	);
};
