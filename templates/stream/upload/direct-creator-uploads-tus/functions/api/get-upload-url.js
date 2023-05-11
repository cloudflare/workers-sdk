export async function onRequest(context) {
	const { request, env } = context;
	const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = env;
	const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`;

	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `bearer ${CLOUDFLARE_API_TOKEN}`,
			"Tus-Resumable": "1.0.0",
			"Upload-Length": request.headers.get("Upload-Length"),
			"Upload-Metadata": request.headers.get("Upload-Metadata"),
		},
	});

	const destination = response.headers.get("Location");

	return new Response(null, {
		headers: {
			"Access-Control-Expose-Headers": "Location",
			"Access-Control-Allow-Headers": "*",
			"Access-Control-Allow-Origin": "*",
			Location: destination,
		},
	});
}
