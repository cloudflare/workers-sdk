/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export default async function (request) {
	const reqTime = new Date();

	const res = new Response('OK');

	res.headers.set('access-control-allow-origin', '*');
	res.headers.set('timing-allow-origin', '*');

	if (request.cf && request.cf.colo) {
		res.headers.set('cf-meta-colo', request.cf.colo);
	}

	res.headers.set('access-control-expose-headers', 'cf-meta-colo, cf-meta-request-time');
	res.headers.set('cf-meta-request-time', String(+reqTime));

	return res;
}
