const COL_DIVIDER = "│";

const tableToArray = (table: string) => {
	const rows = [];
	const lines = table.split("\n"); // discard header row
	for (let line of lines) {
		// Skip over divider lines
		if (line.match(/─+/)) {
			continue;
		}
		// Skip over non-data rows
		if (!line.match(/│/)) {
			continue;
		}

		// Remove all whitespace
		line = line.replace(/\s+/g, "");

		const columns = line
			.slice(1, line.length - 1) // remove first and last divider
			.split(COL_DIVIDER)
			.map((col) => col.trim());
		rows.push(columns);
	}
	return rows;
};

// Parses the table returned from wrangler into an array of objects
export const parseTable = <T>(table: string) => {
	const [header, ...rows] = tableToArray(table);

	// Convert row arrays to objects in the shape defined by the header row
	return rows.map((row) => {
		return row.reduce((acc, columnValue, index) => {
			return {
				...acc,
				[header[index]]: columnValue,
			};
		}, []);
	}) as T[];
};
