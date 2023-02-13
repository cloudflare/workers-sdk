import createStripeClient from "../createStripeClient";

export async function onRequestGet(context) {
	const {
		CLOUDFLARE_ACCOUNT_ID,
		CLOUDFLARE_API_TOKEN,
		CLOUDFLARE_STREAM_VIDEO_UID,
		STRIPE_SECRET_KEY,
		CLOUDFLARE_STREAM_SUBDOMAIN,
		HOST,
	} = context.env;
	const { search } = new URL(context.request.url);
	const params = new URLSearchParams(search);
	const session_id = params.get("session_id");
	const stripe = createStripeClient(STRIPE_SECRET_KEY);
	const session = await stripe.checkout.sessions.retrieve(session_id);
	if (!session) {
		throw new Error("No session found");
	}

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${CLOUDFLARE_STREAM_VIDEO_UID}/token`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
				"content-type": "application/json;charset=UTF-8",
			},
			body: JSON.stringify({
				exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
				downloadable: false,
				accessRules: [
					{ type: "ip.geoip.country", country: ["SM"], action: "block" },
				],
			}),
		}
	);
	const { result } = await response.json();

	const signedUrl = `https://${CLOUDFLARE_STREAM_SUBDOMAIN}.cloudflarestream.com/${result.token}/iframe`;

	return Response.redirect(
		`${HOST}/watch?signedUrl=${signedUrl}&session_id=${session_id}`,
		303
	);
}
