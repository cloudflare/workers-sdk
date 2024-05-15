import { run } from './helpers';

async function read(res: Response) {
	return res.text();
}

test('get request', async () => {
	const res = await run('up', 'GET');
	expect(await read(res)).toEqual('OK');
	expect(res.status).toBe(200);
});

test('empty post request', async () => {
	const res = await run('up', 'POST');
	expect(await read(res)).toEqual('OK');
	expect(res.status).toBe(200);
});

test('includes request time', async () => {
	const { headers } = await run('up', 'POST');
	const reqTime = headers.get('cf-meta-request-time');

	if (!reqTime) throw new Error('missing request time header');
	expect(reqTime);
	expect(+reqTime <= Date.now());
	expect(+reqTime > Date.now() - 60 * 1000);
});
