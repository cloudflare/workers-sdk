export function capitalizeScheme(scheme: string | undefined) {
	let ret = "";

	if (scheme === "mysql") {
		ret = "MySQL";
	}
	if (scheme === "postgres" || scheme === "postgresql") {
		ret = "PostgreSQL";
	}

	return ret;
}
