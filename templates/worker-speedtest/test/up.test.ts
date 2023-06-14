import { run } from './helpers';

async function read(res: Response) {
	return res.text();
}

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

	if (!reqTime) throw new Error('missing request time header');
	expect(reqTime);
	expect(+reqTime <= Date.now());
	expect(+reqTime > Date.now() - 60 * 1000);
});
