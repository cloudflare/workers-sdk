export async function onRequestGet(context) {
	// ID of the video being requested.
	// In practice, you might maintain your own identifier for a given video,
	// and use this to lookup the corresponding Stream Video UID in your database.
	const { CLOUDFLARE_STREAM_VIDEO_UID } = context.env;

	const {
		CLOUDFLARE_ACCOUNT_ID,
		CLOUDFLARE_API_TOKEN,
		CLOUDFLARE_STREAM_SUBDOMAIN,
	} = context.env;

	const clientIP = context.request.headers.get("CF-Connecting-IP");

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
					{
						type: "ip.src",
						ip: [clientIP],
						action: "allow",
					},
				],
			}),
		}
	);
	const { result } = await response.json();
	const signedUrl = `https://${CLOUDFLARE_STREAM_SUBDOMAIN}.cloudflarestream.com/${result.token}/iframe`;
	const json = JSON.stringify({ signedUrl }, null, 2);

	return new Response(json, {
		headers: {
			"content-type": "application/json;charset=UTF-8",
		},
	});
}
