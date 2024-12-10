import { expect, test } from 'vitest';
import { getJsonResponse, getTextResponse } from '../../../__test-utils__';

// TODO: reintroduce test in #63
test.skip('should be able to create a pg Client', async () => {
	const result = await getTextResponse();
	expect(result).toMatchInlineSnapshot(`"hh-pgsql-public.ebi.ac.uk"`);
});

// Disabling actually querying the database in CI since we are getting this error:
// > too many connections for role 'reader'
// TODO: reintroduce test
test
	.runIf(!process.env.CI)
	.skip('should be able to use pg library to send a query', async () => {
		const result = await getJsonResponse('/send-query');
		expect(result!.id).toEqual('1');
	});
