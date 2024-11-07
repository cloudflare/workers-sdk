import { expect, test } from 'vitest';
import { getTextResponse, isBuild } from '../../../__test-utils__';

test.runIf(!isBuild)(
	'import unenv aliased 3rd party packages (e.g. cross-env)',
	async () => {
		const result = await getTextResponse();
		expect(result).toBe(`"OK!"`);
	},
);
