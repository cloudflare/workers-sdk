import { unstable_dev } from 'wrangler';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

describe('Worker', () => {
	let worker;

	beforeAll(async () => {
		worker = await unstable_dev('index.js', {}, { disableExperimentalWarning: true });
	});

	afterAll(async () => {
		await worker.stop();
	});

	it('should return index route response', async () => {
		const resp = await worker.fetch('/');
		if (resp) {
			const text = await resp.text();
			expect(text).toMatchInlineSnapshot(
				`"Hello, world! This is the root page of your Worker template."`
			);
		}
	});

	it('should return status 200 and encoded response', async () => {
		const resp = await worker.fetch('/example/hello');
		if (resp) {
			const text = await resp.text();
			expect(text).toContain('aGVsbG8');
			expect(resp.status).toBe(200);
		}
	});

	it('should return 200 and reponse object', async () => {
		const init = {
			body: { abc: 'def' },
			method: 'POST',
		};
		const resp = await worker.fetch('/post', init);
		const json = await resp.json();
		if (resp) {
			expect(json).toEqual({ asn: 395747, colo: 'DFW' });
			expect(resp.status).toBe(200);
		}
	});

	it('should return 404 for undefined routes', async () => {
		const resp = await worker.fetch('/foobar');
		if (resp) {
			expect(resp.status).toBe(404);
		}
	});
});
