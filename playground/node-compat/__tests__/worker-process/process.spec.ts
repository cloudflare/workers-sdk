import { expect, test } from 'vitest';
import { getTextResponse, isBuild } from '../../../__test-utils__';

test.runIf(!isBuild)('should support process global', async () => {
	const result = await getTextResponse();
	expect(result).toBe(`OK!`);
});
