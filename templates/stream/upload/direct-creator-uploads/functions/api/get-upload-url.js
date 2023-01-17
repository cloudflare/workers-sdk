export async function onRequest(context) {
	const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = context.env;
	const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/direct_upload`;
	const maxDurationSeconds = 3600;
	const data = { maxDurationSeconds };
	const body = JSON.stringify(data);
	const headers = {
		Authorization: `bearer ${CLOUDFLARE_API_TOKEN}`,
	};

	const response = await fetch(endpoint, { method: "POST", headers, body });
	if (!response.ok) {
		throw new Error(await response.json());
	}
	const responseBody = await response.json();
	const destination = responseBody.result.uploadURL;

	return new Response(null, { headers: { Location: destination } });
}
