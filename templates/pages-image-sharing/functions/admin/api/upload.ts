import { jsonResponse } from '../../utils/jsonResponse';
import { parseFormDataRequest } from '../../utils/parseFormDataRequest';
import { IMAGE_KEY_PREFIX } from '../../utils/constants';

export const onRequestPost: PagesFunction<{
	IMAGES: KVNamespace;
	DOWNLOAD_COUNTER: DurableObjectNamespace;
}> = async ({ request, env }) => {
	try {
		const { apiToken, accountId } = (await env.IMAGES.get('setup', 'json')) as Setup;

		// Compatibility dates aren't yet possible to set: https://developers.cloudflare.com/workers/platform/compatibility-dates#formdata-parsing-supports-file
		const formData = (await parseFormDataRequest(request)) as FormData;
		formData.set('requireSignedURLs', 'true');
		const alt = formData.get('alt') as string;
		formData.delete('alt');
		const isPrivate = formData.get('isPrivate') === 'on';
		formData.delete('isPrivate');

		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
			{
				method: 'POST',
				body: formData,
				headers: {
					Authorization: `Bearer ${apiToken}`,
				},
			}
		);

		const {
			result: {
				id,
				filename: name,
				uploaded,
				variants: [url],
			},
		} = await response.json<{
			result: {
				id: string;
				filename: string;
				uploaded: string;
				requireSignedURLs: boolean;
				variants: string[];
			};
		}>();

		const downloadCounterId = env.DOWNLOAD_COUNTER.newUniqueId().toString();

		const metadata: ImageMetadata = {
			id,
			previewURLBase: url.split('/').slice(0, -1).join('/'),
			name,
			alt,
			uploaded,
			isPrivate,
			downloadCounterId,
		};

		await env.IMAGES.put(`${IMAGE_KEY_PREFIX}uploaded:${uploaded}`, 'Values stored in metadata.', {
			metadata,
		});
		await env.IMAGES.put(`${IMAGE_KEY_PREFIX}${id}`, JSON.stringify(metadata));

		return jsonResponse(true);
	} catch {
		return jsonResponse(
			{
				error:
					'Could not upload image. Have you completed setup? Is it less than 10 MB? Is it a supported file type (PNG, JPEG, GIF, WebP)?',
			},
			{ status: 500 }
		);
	}
};
