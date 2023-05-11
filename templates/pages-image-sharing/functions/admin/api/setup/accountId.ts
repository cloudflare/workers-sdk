import { jsonResponse } from '../../../utils/jsonResponse';

export const onRequestPost: PagesFunction<{ IMAGES: KVNamespace }> = async ({ request, env }) => {
	let accountId: string;

	try {
		accountId = (await request.json<{ accountId: string }>()).accountId;
	} catch {
		return jsonResponse({ error: 'Could not parse account ID.' }, { status: 400 });
	}

	try {
		const { apiToken } = (await env.IMAGES.get('setup', 'json')) as Setup;
		await env.IMAGES.put('setup', JSON.stringify({ apiToken, accountId }));
		return jsonResponse(true);
	} catch (thrown) {
		return jsonResponse({ error: `Could not select account: ${thrown}` });
	}
};
