const DEFAULT_NUM_BYTES = 0;
const MAX_BYTES = 1e8;

export default async function (request: Request) {
	const reqTime = new Date();

	const { searchParams: qs } = new URL(request.url);

	const value = qs.get('bytes');
	const numBytes = value != null ? Math.min(MAX_BYTES, Math.abs(+value)) : DEFAULT_NUM_BYTES;

	const res = new Response('0'.repeat(Math.max(0, numBytes)));

	res.headers.set('access-control-allow-origin', '*');
	res.headers.set('timing-allow-origin', '*');
	res.headers.set('cache-control', 'no-store');
	res.headers.set('content-type', 'application/octet-stream');

	if (request.cf && request.cf.colo) {
		res.headers.set('cf-meta-colo', String(request.cf.colo));
	}

	res.headers.set('access-control-expose-headers', 'cf-meta-colo, cf-meta-request-time');
	res.headers.set('cf-meta-request-time', String(+reqTime));

	return res;
}
