import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as vite from 'vite';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import {
	getFallbackErrors,
	getWorker,
	MockLogger,
	UNKNOWN_HOST,
} from '../test-helpers/src/utils';

const root = fileURLToPath(new URL('./', import.meta.url));

let server: vite.ViteDevServer;
let customLogger: MockLogger;

describe('module resolution', async () => {
	beforeEach(async ({ onTestFinished }) => {
		customLogger = new MockLogger();
		server = await vite.createServer({
			customLogger,
			plugins: [
				cloudflare({
					workers: {
						worker: {
							main: path.join(root, 'index.ts'),
							wranglerConfig: path.join(root, 'wrangler.toml'),
							overrides: {
								resolve: {
									// We're testing module resolution for external modules, so let's treat everything as external
									// (if we were not to do this all the packages in cloudflare-dev-module-resolution/packages
									// wouldn't be treated as such)
									external: true,
								},
							},
						},
					},
					persistTo: false,
				}),
			],
		});
		onTestFinished(() => server.close());
	});

	describe('basic module resolution', () => {
		test('`require` js/cjs files with specifying their file extension', async () => {
			const response = await getWorker(server).dispatchFetch(
				new Request(new URL('/require-ext', UNKNOWN_HOST)),
			);
			const result = await response.json();

			expect(getFallbackErrors(customLogger)).toMatchInlineSnapshot(`
				[
				  ".%2Fhello.cjs",
				  ".%2Fworld.js",
				]
			`);

			expect(result).toEqual({
				'(requires/ext) hello.cjs (wrong-extension)': null,
				'(requires/ext) helloWorld': 'hello (.js) world (.cjs)',
				'(requires/ext) world.js (wrong-extension)': null,
			});
		});

		test('`require` js/cjs files without specifying their file extension', async () => {
			const response = await getWorker(server).dispatchFetch(
				new Request(new URL('/require-no-ext', UNKNOWN_HOST)),
			);
			const result = await response.json();

			expect(result).toEqual({
				'(requires/no-ext) helloWorld': 'hello (.js) world (.cjs)',
			});
		});

		test('`require` json files', async () => {
			const response = await getWorker(server).dispatchFetch(
				new Request(new URL('/require-json', UNKNOWN_HOST)),
			);
			const result = await response.json();

			expect(result).toEqual({
				'(requires/json) package name':
					'@cloudflare-dev-module-resolution/requires',
				'(requires/json) package version': '1.0.0',
			});
		});
	});

	describe('Cloudflare specific module resolution', () => {
		test('internal imports from `cloudflare:*`', async () => {
			const response = await getWorker(server).dispatchFetch(
				new Request(new URL('/cloudflare-imports', UNKNOWN_HOST)),
			);
			const result = await response.json();

			expect(result).toEqual({
				'(cloudflare:workers) WorkerEntrypoint.name': 'WorkerEntrypoint',
				'(cloudflare:workers) DurableObject.name': 'DurableObject',
				'(cloudflare:sockets) typeof connect': 'function',
			});
		});

		test('external imports from `cloudflare:*`', async () => {
			const response = await getWorker(server).dispatchFetch(
				new Request(new URL('/external-cloudflare-imports', UNKNOWN_HOST)),
			);
			const result = await response.json();

			expect(result).toEqual({
				'(EXTERNAL) (cloudflare:workers) DurableObject.name': 'DurableObject',
			});
		});
	});

	/**
	 *  These tests check that module resolution works as intended for various third party npm packages (these tests are more
	 *  realistic but less helpful than the other ones (these can be considered integration tests whilst the other unit tests)).
	 *
	 *  These are packages that involve non-trivial module resolutions (and that in the past we had issues with), they have no
	 *  special meaning to us.
	 */
	describe('third party packages resolutions', () => {
		test('react', async () => {
			const response = await getWorker(server).dispatchFetch(
				new Request(new URL('/third-party/react', UNKNOWN_HOST)),
			);
			const result = await response.json();

			expect(result).toEqual({
				'(react) reactVersionsMatch': true,
				'(react) typeof React': 'object',
				'(react) typeof React.cloneElement': 'function',
			});
		});

		test('@remix-run/cloudflare', async () => {
			const response = await getWorker(server).dispatchFetch(
				new Request(new URL('/third-party/remix', UNKNOWN_HOST)),
			);
			const result = await response.json();

			expect(result).toEqual({
				'(remix) remixRunCloudflareCookieName':
					'my-remix-run-cloudflare-cookie',
				'(remix) typeof cloudflare json({})': 'object',
			});
		});

		test('discord-api-types/v10', async () => {
			const response = await getWorker(server).dispatchFetch(
				new Request(new URL('/third-party/discord-api-types', UNKNOWN_HOST)),
			);
			const result = await response.json();

			expect(result).toEqual({
				'(discord-api-types/v10) RPCErrorCodes.InvalidUser': 4010,
				'(discord-api-types/v10) Utils.isLinkButton({})': false,
			});
		});

		test('slash-create', async () => {
			const response = await getWorker(server).dispatchFetch(
				new Request(new URL('/third-party/slash-create', UNKNOWN_HOST)),
			);
			const result = await response.json();

			expect(result).toEqual({
				'(slash-create/web) VERSION': '6.2.1',
				'(slash-create/web) myCollection.random()': 54321,
				'(slash-create/web) slashCreatorInstance is instance of SlashCreator':
					true,
			});
		});
	});
});
