import { jsonResponse } from '../../../utils/jsonResponse';

const variantPayloads = [
	{
		id: 'blurred',
		neverRequireSignedURLs: true,
		options: {
			blur: 15,
			fit: 'scale-down',
			height: 360,
			metadata: 'none',
			width: 360,
		},
	},
	{
		id: 'preview',
		options: {
			fit: 'scale-down',
			height: 360,
			metadata: 'none',
			width: 360,
		},
	},
	{
		id: 'highres',
		options: {
			fit: 'scale-down',
			height: 2000,
			metadata: 'none',
			width: 2000,
		},
	},
];

export const onRequestPost: PagesFunction<{ IMAGES: KVNamespace }> = async ({ request, env }) => {
	let apiToken: string, accountId: string;

	try {
		const setup = (await env.IMAGES.get('setup', 'json')) as Setup;
		apiToken = setup.apiToken;
		accountId = setup.accountId;
	} catch (thrown) {
		return jsonResponse(
			{ error: `Could not get setup configuration: ${thrown}.` },
			{ status: 500 }
		);
	}

	try {
		const keysResponse = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/keys`,
			{
				headers: { Authorization: `Bearer ${apiToken}` },
			}
		);
		const {
			result: {
				keys: [{ value: imagesKey }],
			},
		} = await keysResponse.json();

		await env.IMAGES.put('setup', JSON.stringify({ apiToken, accountId, imagesKey }));

		const variantResponsePromises = await Promise.allSettled(
			variantPayloads.map(async variantPayload =>
				fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/variants`, {
					method: 'POST',
					body: JSON.stringify(variantPayload),
					headers: {
						Authorization: `Bearer ${apiToken}`,
					},
				})
			)
		);

		for (const responsePromise of variantResponsePromises) {
			if (responsePromise.status === 'rejected' || !responsePromise.value.ok) {
				throw new Error('Could not configure a variant.');
			}
		}

		return jsonResponse(true);
	} catch (thrown) {
		return jsonResponse(
			{
				error: `Could not configure Cloudflare Images: ${thrown}.`,
			},
			{ status: 500 }
		);
	}
};
