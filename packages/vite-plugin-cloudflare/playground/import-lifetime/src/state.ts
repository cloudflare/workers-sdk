export const phases = {
	early: {
		started: false,
		evaluated: false,
		settled: "pending",
		aborted: false,
	},
	abort: {
		started: false,
		evaluated: false,
		settled: "pending",
		aborted: false,
	},
	reject: {
		started: false,
		evaluated: false,
		settled: "pending",
		aborted: false,
	},
};

export type Arm = keyof typeof phases;
