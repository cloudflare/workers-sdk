import worker from '../src/up.js';

/**
 * @param {number} [num]
 * @returns {Promise<Response>}
 */
async function run(num) {
	let url = 'https://x.com/up';
	if (num != null) url += '?bytes=' + num;
	let req = new Request(url);
	return worker(req);
}

/**
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function read(res) {
	return res.text();
}

test('get request', async () => {
	const req = new Request('http://falcon', { method: 'GET' });
	const res = await run(req);
	expect(await read(res)).toEqual('OK');
	expect(res.status).toBe(200);
});

test('get request', async () => {
	const res = await run('GET');
	expect(await read(res)).toEqual('OK');
	expect(res.status).toBe(200);
});

test('empty post request', async () => {
	const res = await run('POST', 0);
	expect(await read(res)).toEqual('OK');
	expect(res.status).toBe(200);
});

test('small post request', async () => {
	const res = await run('POST', 10);
	expect(await read(res)).toEqual('OK');
	expect(res.status).toBe(200);
});

test('large post request', async () => {
	const res = await run('POST', 1e8);
	expect(await read(res)).toEqual('OK');
	expect(res.status).toBe(200);
});

test('includes request time', async () => {
	const { headers } = await run('POST');
	const reqTime = headers.get('cf-meta-request-time');

	expect(reqTime);
	expect(+reqTime <= Date.now());
	expect(+reqTime > Date.now() - 60 * 1000);
});
