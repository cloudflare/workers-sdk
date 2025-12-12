import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { it, expect } from 'vitest';
import worker from '../src/index';
it('works', async () => {
	const request = new Request('http://example.com');
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	expect(await response.text()).toBe('ok');
});
