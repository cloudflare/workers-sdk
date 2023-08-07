import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

describe('Worker', () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev('src/index.ts', {}, { disableExperimentalWarning: true });
	});

	afterAll(async () => {
		await worker.stop();
	});

	it('should return 200 response', async () => {
		const req = new Request('https://example.com', { method: 'GET' });
		const resp = await worker.fetch(req.url);
		expect(resp.status).toBe(200);

		const text = await resp.text();
		expect(text).toBe('request method: GET');
	});
});
