// This is temporary and will be replaced with a proper logging system in a future PR
// Until then, this is a stop-gap that will make future refactoring easier
export const debug = (msg: string) => {
	if (process.env.VITEST) {
		console.log(msg);
	}
};
