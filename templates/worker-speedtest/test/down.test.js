import worker from '../src/down.js';

/**
 * @param {number} [num]
 * @returns {Promise<Response>}
 */
async function run(num) {
	let url = 'https://x.com/down';
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

test('default bytes', async () => {
	const text = await run().then(read);
	expect(text.length).toBe(0);
});

[0, 1, 10, 50, 99].forEach(bytes => {
	test(`low request bytes :: ${bytes}`, async () => {
		const text = await run(bytes).then(read);
		expect(text.length).toEqual(bytes);
	});
});

[100, 1e3, 1e6, 1e7].forEach(bytes => {
	test(`request bytes :: get ${bytes} bytes`, async () => {
		const text = await run(bytes).then(read);
		expect(text.length).toEqual(bytes);
	});
});

test('max bytes', async () => {
	const text = await run(Infinity).then(read);
	expect(text.length).toEqual(1e8);
});

test('negative bytes', async () => {
	const content = await run(-100).then(read);
	expect(content.length).toBe(100);
});

test('includes request time', async () => {
	const { headers } = await run();
	const reqTime = headers.get('cf-meta-request-time');

	expect(reqTime);
	expect(+reqTime <= Date.now());
	expect(+reqTime > Date.now() - 60 * 1000);
});
