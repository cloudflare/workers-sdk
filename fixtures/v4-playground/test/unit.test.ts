import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { it, expect } from 'vitest';
import worker from '../src/index';
it('sends request', async () => {
	const request = new Request('https://example.com');
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	expect(await response.text()).toBe('correct');
});
