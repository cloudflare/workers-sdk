import { jsonResponse } from '../../../utils/jsonResponse';

export const onRequestPost: PagesFunction<{ IMAGES: KVNamespace }> = async ({ request, env }) => {
	try {
		const { accessAud } = await request.json();
		const { apiToken, accountId, imagesKey } = (await env.IMAGES.get('setup', 'json')) as Setup;

		await env.IMAGES.put('setup', JSON.stringify({ apiToken, accountId, imagesKey, accessAud }));

		return jsonResponse(true);
	} catch (thrown) {
		return jsonResponse(
			{ error: `Could not save Cloudflare Access \`aud\`: ${thrown}.` },
			{ status: 500 }
		);
	}
};
