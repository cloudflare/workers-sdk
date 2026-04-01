export type DatabaseConnectionInfo = {
	scheme: "postgres" | "postgresql" | "mysql";
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
};

/**
 * Detects if a string is a PostgreSQL or MySQL connection string.
 * Returns parsed connection info if it is, null otherwise.
 *
 * Supports formats like:
 *   postgres://user:password@host:port/database
 *   postgresql://user:password@host:port/database
 *   mysql://user:password@host:port/database
 */
export function detectDatabaseConnectionString(
	value: string
): DatabaseConnectionInfo | null {
	try {
		const url = new URL(value);
		const protocol = url.protocol.replace(":", "").toLowerCase();

		if (
			protocol !== "postgres" &&
			protocol !== "postgresql" &&
			protocol !== "mysql"
		) {
			return null;
		}

		if (!url.hostname || !url.username || !url.password) {
			return null;
		}

		const database = decodeURIComponent(url.pathname.replace("/", ""));
		if (!database) {
			return null;
		}

		let port = parseInt(url.port);
		if (isNaN(port) || port === 0) {
			port = protocol === "mysql" ? 3306 : 5432;
		}

		return {
			scheme: protocol as DatabaseConnectionInfo["scheme"],
			host: url.hostname,
			port,
			database,
			user: decodeURIComponent(url.username),
			password: decodeURIComponent(url.password),
		};
	} catch {
		return null;
	}
}

/**
 * Returns a human-readable database type label for the detected scheme.
 */
export function getDatabaseTypeLabel(
	scheme: DatabaseConnectionInfo["scheme"]
): string {
	return scheme === "mysql" ? "MySQL" : "PostgreSQL";
}
