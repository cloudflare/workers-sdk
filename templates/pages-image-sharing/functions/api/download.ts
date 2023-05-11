import { IMAGE_KEY_PREFIX } from '../utils/constants';
import { generateSignedURL } from '../utils/generateSignedURL';

export const onRequestGet: PagesFunction<{
	IMAGES: KVNamespace;
	DOWNLOAD_COUNTER: DurableObjectNamespace;
}> = async ({ request, env }) => {
	const url = new URL(request.url);
	const id = url.searchParams.get('id');
	const { previewURLBase, downloadCounterId } = (await env.IMAGES.get(
		`${IMAGE_KEY_PREFIX}${id}`,
		'json'
	)) as ImageMetadata;
	const { imagesKey } = (await env.IMAGES.get('setup', 'json')) as Setup;

	const hexId = env.DOWNLOAD_COUNTER.idFromString(downloadCounterId);
	const downloadCounter = env.DOWNLOAD_COUNTER.get(hexId);

	await downloadCounter.fetch('https://images.pages.dev/increment');

	return new Response(null, {
		headers: {
			Location: await generateSignedURL({
				url: `${previewURLBase}/highres`,
				imagesKey,
			}),
		},
		status: 302,
	});
};
