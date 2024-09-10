export const Name = {
	name: {
		describe: "The name or binding of the DB",
		type: "string",
		demandOption: true,
	},
} as const;

export const Database = {
	database: {
		describe: "The name or binding of the DB",
		type: "string",
		demandOption: true,
	},
} as const;
