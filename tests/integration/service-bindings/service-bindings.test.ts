import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import * as vite from 'vite';
import {
	beforeEach,
	describe,
	expect,
	onTestFailed,
	onTestFinished,
	test,
} from 'vitest';
import { getWorker, MockLogger, UNKNOWN_HOST } from '../test-helpers/src/utils';
import type { FetchableDevEnvironment } from '../test-helpers/src/utils';

const root = fileURLToPath(new URL('.', import.meta.url));
let server: vite.ViteDevServer;
let customLogger: MockLogger;
let workerA: FetchableDevEnvironment;

describe('service bindings', async () => {
	beforeEach(async ({ onTestFinished }) => {
		customLogger = new MockLogger();
		server = await vite.createServer({
			customLogger,
			plugins: [
				cloudflare({
					workers: {
						worker_a: {
							main: path.join(root, 'worker-a/index.ts'),
							wranglerConfig: path.join(root, 'worker-a/wrangler.toml'),
						},
						worker_b: {
							main: path.join(root, 'worker-b/index.ts'),
							wranglerConfig: path.join(root, 'worker-b/wrangler.toml'),
						},
					},
					persistTo: false,
				}),
			],
		});
		workerA = getWorker(server, 'worker_a');
		onTestFinished(() => server.close());
	});

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
