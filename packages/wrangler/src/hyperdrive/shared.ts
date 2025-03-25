export function capitalizeScheme(scheme: string | undefined) {
	switch (scheme) {
		case "mysql":
			return "MySQL";
		case "postgres":
		case "postgresql":
			return "PostgreSQL";
		default:
			return "";
	}
}
