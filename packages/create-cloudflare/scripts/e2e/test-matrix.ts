const options = {
	isExperimentalMode: [false, true],
	testPm: [
		{ name: "pnpm", version: "9.12.0" },
		{ name: "npm", version: "0.0.0" },
		{ name: "yarn", version: "1.0.0" },
	],
};

export const matrix = options.isExperimentalMode.flatMap((isExperimentalMode) =>
	options.testPm.map((testPm) => ({ isExperimentalMode, testPm })),
);
