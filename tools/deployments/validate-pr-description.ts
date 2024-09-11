if (require.main === module) {
	const errors = validateDescription(
		process.env.TITLE as string,
		process.env.BODY as string
	);
	if (errors.length > 0) {
		console.error("Validation errors in changesets:");
		for (const error of errors) {
			console.error("- ", error);
		}
		process.exit(1);
	}
}

export function validateDescription(title: string, body: string) {
	const errors: string[] = [];

	console.log("PR:", title);

	console.log(body);

	return errors;
}
