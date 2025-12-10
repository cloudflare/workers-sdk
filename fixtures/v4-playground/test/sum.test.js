import { expect, test } from 'vitest';
import { sum } from './sum.js';
import { env } from 'cloudflare:test';

test('adds 1 + 2 to equal 3', () => {
	globalThis.testIsolate = 'hello';
	expect(sum(1, 2)).toBe(3);
	expect(navigator.userAgent).toMatchInlineSnapshot(`"Cloudflare-Workers"`);
});
test('responds with "Hello, World!" (integration style)', async () => {
	await env.kv.put('b', 'c');

	expect((await env.kv.list()).keys.length).toMatchInlineSnapshot(`1`);
});
