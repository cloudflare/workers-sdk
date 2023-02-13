import createStripeClient from "../createStripeClient";

export async function onRequestPost(context) {
	const { STRIPE_SECRET_KEY, PRICE, HOST } = context.env;
	const stripe = createStripeClient(STRIPE_SECRET_KEY);

	const session = await stripe.checkout.sessions.create({
		mode: "payment",
		line_items: [
			{
				price: PRICE,
				quantity: 1,
			},
		],
		success_url: `${HOST}/api/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${HOST}/api/canceled`,
		billing_address_collection: "auto",
	});

	return Response.redirect(session.url, 303);
}
