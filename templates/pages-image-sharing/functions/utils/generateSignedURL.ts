// Adapted from https://developers.cloudflare.com/images/cloudflare-images/serve-images/serve-private-images-using-signed-url-tokens

const bufferToHex = buffer =>
	[...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');

const EXPIRATION = 60 * 60; // 1 hour

export const generateSignedURL = async ({
	url: urlString,
	imagesKey,
}: {
	url: string;
	imagesKey: string;
}) => {
	const url = new URL(urlString);
	const encoder = new TextEncoder();
	const secretKeyData = encoder.encode(imagesKey);
	const key = await crypto.subtle.importKey(
		'raw',
		secretKeyData,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	// Attach the expiration value to the `url`
	const expiry = Math.floor(Date.now() / 1000) + EXPIRATION;
	url.searchParams.set('exp', expiry.toString());
	// `url` now looks like
	// https://imagedelivery.net/cheeW4oKsx5ljh8e8BoL2A/bc27a117-9509-446b-8c69-c81bfeac0a01/mobile?exp=1631289275

	const stringToSign = url.pathname + '?' + url.searchParams.toString();
	// e.g. /cheeW4oKsx5ljh8e8BoL2A/bc27a117-9509-446b-8c69-c81bfeac0a01/mobile?exp=1631289275

	// Generate the signature
	const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
	const sig = bufferToHex(new Uint8Array(mac).buffer);

	// And attach it to the `url`
	url.searchParams.set('sig', sig);

	return url.toString();
};
