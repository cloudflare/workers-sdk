import { expect, test } from 'vitest';
import { getTextResponse, isBuild } from '../../../__test-utils__';

// TODO: test build
test.runIf(!isBuild)('basic nodejs properties', async () => {
	const result = await getTextResponse();
	expect(result).toBe(`"OK!"`);
});
