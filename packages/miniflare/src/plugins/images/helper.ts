/**
 * Helper function to import Sharp library dynamically
 * @returns The Sharp constructor function
 * @throws Response with error details if Sharp is not available
 */
export async function importSharp() {
	try {
		// eslint-disable-next-line es/no-dynamic-import
		const { default: importedSharp } = await import("sharp");
		return importedSharp;
	} catch {
		// This should be unreachable, as we should have errored by now
		// if sharp isn't installed
		throw new Response(
			"ERROR 9523: The Sharp library is not available, check your version of Node is compatible",
			{
				status: 503,
				headers: {
					"content-type": "text/plain",
					"cf-images-binding": "err=9523",
				},
			}
		);
	}
}
