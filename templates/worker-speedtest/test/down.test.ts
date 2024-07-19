import { run } from './helpers';

async function read(res: Response) {
	return res.text();
}

test('default bytes', async () => {
	const text = await run('down').then(read);
	expect(text.length).toBe(0);
});

[0, 1, 10, 50, 99].forEach(bytes => {
	test(`low request bytes :: ${bytes}`, async () => {
		const text = await run('down', 'GET', bytes).then(read);
		expect(text.length).toEqual(bytes);
	});
});

[100, 1e3, 1e6, 1e7].forEach(bytes => {
	test(`request bytes :: get ${bytes} bytes`, async () => {
		const text = await run('down', 'GET', bytes).then(read);
		expect(text.length).toEqual(bytes);
	});
});

test('max bytes', async () => {
	const text = await run('down', 'GET', Infinity).then(read);
	expect(text.length).toEqual(1e8);
});

test('negative bytes', async () => {
	const content = await run('down', 'GET', -100).then(read);
	expect(content.length).toBe(100);
});

test('includes request time', async () => {
	const { headers } = await run('down');
	const reqTime = headers.get('cf-meta-request-time');

	if (!reqTime) throw new Error('missing request time header');
	expect(reqTime);
	expect(+reqTime <= Date.now());
	expect(+reqTime > Date.now() - 60 * 1000);
});
