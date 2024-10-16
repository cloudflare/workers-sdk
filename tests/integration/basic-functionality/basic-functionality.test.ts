import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import * as vite from 'vite';
import { beforeEach, describe, expect, test } from 'vitest';
import { getWorker, MockLogger, UNKNOWN_HOST } from '../test-helpers/src/utils';
import type { FetchableDevEnvironment } from '../test-helpers/src/utils';

const root = fileURLToPath(new URL('.', import.meta.url));
let server: vite.ViteDevServer;
let customLogger: MockLogger;
let worker: FetchableDevEnvironment;

describe('service bindings', async () => {
	beforeEach(async ({ onTestFinished }) => {
		customLogger = new MockLogger();
		server = await vite.createServer({
			customLogger,
			plugins: [
				cloudflare({
					workers: {
						worker: {
							main: path.join(root, 'worker/index.ts'),
							wranglerConfig: path.join(root, 'worker/wrangler.toml'),
						},
					},
					persistTo: false,
				}),
			],
		});
		worker = getWorker(server);
		onTestFinished(() => server.close());
	});

	test('returns a response from the worker', async () => {
		const response = await worker.dispatchFetch(new Request(UNKNOWN_HOST));
		const result = await response.json();

		expect(result).toEqual({ status: 'OK' });
	});

	test('forwards console logs from the worker', async () => {
		await worker.dispatchFetch(new Request(UNKNOWN_HOST));
		expect(customLogger.getLogs('info')).toMatchInlineSnapshot(`"console log"`);
		expect(customLogger.getLogs('error')).toMatchInlineSnapshot(`
			"console warn
			console error"
		`);
	});
});
