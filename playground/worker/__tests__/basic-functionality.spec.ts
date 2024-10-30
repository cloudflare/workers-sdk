import { expect, test } from 'vitest';
import { getTextResponse, isBuild, serverLogs } from '../../__test-utils__';

test.runIf(!isBuild)('basic hello-world functionality', async () => {
	expect(await getTextResponse()).toEqual('Hello World!');
});

test.runIf(!isBuild)('basic dev logging', async () => {
	expect(serverLogs.info.join()).toContain('__console log__');
	expect(serverLogs.errors.join()).toContain('__console error__');
	expect(serverLogs.errors.join()).toContain('__console warn__');
});
