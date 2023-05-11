import { jsonResponse } from '../../../utils/jsonResponse';

export const onRequestPost: PagesFunction<{ IMAGES: KVNamespace }> = async ({ request, env }) => {
	let apiToken: string;
	let response: Response;

	try {
		apiToken = (await request.json<{ apiToken: string }>()).apiToken;
	} catch {
		return jsonResponse({ error: 'Could not parse API token.' }, { status: 400 });
	}

	try {
		response = await fetch(`https://api.cloudflare.com/client/v4/accounts`, {
			headers: { Authorization: `Bearer ${apiToken}` },
		});
		const data = await response.json<{
			result: { id: string; name: string }[];
			errors: unknown[];
		}>();
		if (data.errors.length > 0) throw data.errors;

		if (data.result.length === 1) {
			const accountId = data.result[0].id;
			await env.IMAGES.put('setup', JSON.stringify({ apiToken, accountId }));
			return jsonResponse({ accountId });
		} else {
			await env.IMAGES.put('setup', JSON.stringify({ apiToken }));
		}

		return jsonResponse({
			accounts: data.result.map(({ id, name }) => ({ id, name })),
		});
	} catch (thrown) {
		return jsonResponse(
			{
				error: `Could not load accounts: ${JSON.stringify(thrown)}.`,
			},
			{ status: 500 }
		);
	}
};
