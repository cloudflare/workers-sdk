import { describe, expect, test } from 'vitest';
import { getJsonResponse, isBuild } from '../../__test-utils__';

describe.runIf(!isBuild)('multi-worker service bindings', async () => {
	test('returns a response from another worker', async () => {
		const result = await getJsonResponse('/fetch');
		expect(result).toEqual({ result: { name: 'Worker B' } });
	});

	test('calls an RPC method on another worker', async () => {
		const result = await getJsonResponse('/rpc-method');
		expect(result).toEqual({ result: 9 });
	});

	test('calls an RPC getter on another worker', async () => {
		const result = await getJsonResponse('/rpc-getter');
		expect(result).toEqual({ result: 'Cloudflare' });
	});

	test('calls an RPC method on a named entrypoint', async () => {
		const result = await getJsonResponse('/rpc-named-entrypoint');
		expect(result).toEqual({ result: 20 });
	});
});
