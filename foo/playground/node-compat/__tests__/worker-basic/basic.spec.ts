import { expect, test } from 'vitest';
import { getTextResponse } from '../../../__test-utils__';

// TODO: reintroduce test in #63
test.skip('basic nodejs properties', async () => {
	const result = await getTextResponse();
	expect(result).toBe(`"OK!"`);
});
