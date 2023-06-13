import worker from '../src/index';

test('GET / :: 404', async () => {
	const req = new Request('https://example.com', { method: 'GET' });
	const result = await worker.fetch(req);
	expect(result.status).toBe(404);

	const text = await result.text();
	expect(text).toBe('Not found');
});

test('GET /up/ :: 200', async () => {
	const req = new Request('https://example.com/up/');
	const res = await worker.fetch(req);
	expect(res.status).toBe(200);
});

test('GET /down/ :: 200', async () => {
	const req = new Request('https://example.com/down/');
	const res = await worker.fetch(req);
	expect(res.status).toBe(200);
});

test('POST /foobar :: 404', async () => {
	const req = new Request('https://example.com/foobar/');
	const res = await worker.fetch(req);
	expect(res.status).toBe(404);
});
