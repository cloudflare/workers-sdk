import { jsonResponse } from '../utils/jsonResponse';

// Returns `true` if setup has been completed.
export const onRequestGet: PagesFunction<{ IMAGES: KVNamespace }> = async ({ env }) => {
	try {
		const setup = (await env.IMAGES.get('setup', 'json')) as Setup;
		if (setup.imagesKey) return jsonResponse(true);
	} catch {}

	return jsonResponse(false);
};
