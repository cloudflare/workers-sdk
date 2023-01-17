import Stripe from "stripe";

export default function createStripeClient(STRIPE_SECRET_KEY) {
	return Stripe(STRIPE_SECRET_KEY, {
		httpClient: Stripe.createFetchHttpClient(),
	});
}
