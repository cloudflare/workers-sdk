import { SELF } from 'cloudflare:test';
import { it, expect } from 'vitest';
it('sends request', async () => {
	const response = await SELF.fetch('https://example.com');
	expect(await response.text()).toBe('correct');
});
