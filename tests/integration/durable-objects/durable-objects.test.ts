import { describe, expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as vite from 'vite';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { getWorker, MockLogger, UNKNOWN_HOST } from '../test-helpers/src/utils';

const root = fileURLToPath(new URL('.', import.meta.url));

describe('durable objects', () => {
	test('retains in-memory state', async () => {
		const customLogger = new MockLogger();
		const server = await vite.createServer({
			customLogger,
			plugins: [
				cloudflare({
					workers: {
						worker: {
							main: path.join(root, 'worker-a/index.ts'),
							wranglerConfig: path.join(root, 'worker-a/wrangler.toml'),
						},
					},
					persistTo: false,
				}),
			],
		});

		const worker = getWorker(server);
		const response = await worker.dispatchFetch(new Request(UNKNOWN_HOST));
		const result = await response.json();

		expect(result).toEqual({ resultA: { count: 0 }, resultB: { count: 3 } });
	});

	test('can access `ctx.storage`', async () => {
		const customLogger = new MockLogger();
		const server = await vite.createServer({
			customLogger,
			plugins: [
				cloudflare({
					workers: {
						worker: {
							main: path.join(root, 'worker-b/index.ts'),
							wranglerConfig: path.join(root, 'worker-b/wrangler.toml'),
						},
					},
					persistTo: false,
				}),
			],
		});

		const worker = getWorker(server);
		const responseA = await worker.dispatchFetch(
			new Request(new URL('?name=A', UNKNOWN_HOST)),
		);
		const resultA = await responseA.json();

		expect(resultA).toEqual({ name: 'A', count: 0 });

		await worker.dispatchFetch(
			new Request(new URL('increment?name=A', UNKNOWN_HOST)),
		);
		await worker.dispatchFetch(
			new Request(new URL('increment?name=A', UNKNOWN_HOST)),
		);

		const responseB = await worker.dispatchFetch(
			new Request(new URL('?name=A', UNKNOWN_HOST)),
		);
		const resultB = await responseB.json();

		expect(resultB).toEqual({ name: 'A', count: 2 });
	});

	test('isolates Durable Object instances', async () => {
		const customLogger = new MockLogger();
		const server = await vite.createServer({
			customLogger,
			plugins: [
				cloudflare({
					workers: {
						worker: {
							main: path.join(root, 'worker-b/index.ts'),
							wranglerConfig: path.join(root, 'worker-b/wrangler.toml'),
						},
					},
					persistTo: false,
				}),
			],
		});

		const worker = getWorker(server);
		await worker.dispatchFetch(
			new Request(new URL('increment?name=A', UNKNOWN_HOST)),
		);
		await worker.dispatchFetch(
			new Request(new URL('increment?name=A', UNKNOWN_HOST)),
		);

		const responseA = await worker.dispatchFetch(
			new Request(new URL('?name=A', UNKNOWN_HOST)),
		);
		const resultA = await responseA.json();

		const responseB = await worker.dispatchFetch(
			new Request(new URL('?name=B', UNKNOWN_HOST)),
		);
		const resultB = await responseB.json();

		expect(resultA).toEqual({ name: 'A', count: 2 });
		expect(resultB).toEqual({ name: 'B', count: 0 });
	});

	test('can use `scriptName` to bind to a Durable Object defined in another Worker', async () => {
		const customLogger = new MockLogger();
		const server = await vite.createServer({
			customLogger,
			plugins: [
				cloudflare({
					workers: {
						worker_b: {
							main: path.join(root, 'worker-b/index.ts'),
							wranglerConfig: path.join(root, 'worker-b/wrangler.toml'),
						},
						worker_c: {
							main: path.join(root, 'worker-c/index.ts'),
							wranglerConfig: path.join(root, 'worker-c/wrangler.toml'),
						},
					},
					persistTo: false,
				}),
			],
		});

		const workerC = getWorker(server, 'worker_c');
		const response = await workerC.dispatchFetch(
			new Request(new URL('?name=A', UNKNOWN_HOST)),
		);
		const result = await response.json();

		expect(result).toEqual({ name: 'A', count: 0 });
	});
});
