import { expect, test } from 'vitest';
import { getTextResponse } from '../../../__test-utils__';

// TODO: reintroduce test in #63
test.skip('import unenv aliased 3rd party packages (e.g. cross-env)', async () => {
	const result = await getTextResponse();
	expect(result).toBe(`"OK!"`);
});
