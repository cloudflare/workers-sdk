import { describe, expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as vite from 'vite';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { assertIsFetchableDevEnvironment, UNKNOWN_HOST } from './utils';

const root = fileURLToPath(new URL('./', import.meta.url));

describe('service bindings', async () => {
	const fixtureRoot = path.join(root, './fixtures/service-bindings');
	const server = await vite.createServer({
		plugins: [
			cloudflare({
				workers: {
					worker_a: {
						main: path.join(fixtureRoot, 'worker-a', 'index.ts'),
						wranglerConfig: path.join(fixtureRoot, 'worker-a', 'wrangler.toml'),
					},
					worker_b: {
						main: path.join(fixtureRoot, 'worker-b', 'index.ts'),
						wranglerConfig: path.join(fixtureRoot, 'worker-b', 'wrangler.toml'),
					},
				},
			}),
		],
	});

	const workerA = server.environments.worker_a;
	assertIsFetchableDevEnvironment(workerA);

	test('returns a response from another worker', async () => {
		const response = await workerA.dispatchFetch(
			new Request(new URL('/fetch', UNKNOWN_HOST)),
		);
		const result = await response.json();

		expect(result).toEqual({
			result: { name: 'Worker B' },
		});
	});

	test('calls an RPC method on another worker', async () => {
		const response = await workerA.dispatchFetch(
			new Request(new URL('/rpc-method', UNKNOWN_HOST)),
		);
		const result = await response.json();

		expect(result).toEqual({ result: 9 });
	});

	test('calls an RPC getter on another worker', async () => {
		const response = await workerA.dispatchFetch(
			new Request(new URL('/rpc-getter', UNKNOWN_HOST)),
		);
		const result = await response.json();

		expect(result).toEqual({ result: 'Cloudflare' });
	});

	test('calls an RPC method on a named entrypoint', async () => {
		const response = await workerA.dispatchFetch(
			new Request(new URL('/rpc-named-entrypoint', UNKNOWN_HOST)),
		);
		const result = await response.json();

		expect(result).toEqual({ result: 20 });
	});
});
