import path from "path";
import Stripe from "stripe";

export const onRequest = () => {
	// make sure path actually works
	return new Response(
		JSON.stringify({
			PATH: path.join("path/to", "some-file"),
			STRIPE_OBJECT: Stripe.toString(),
		})
	);
};
