import "dotenv/config"; // Grab locally specified env params from a `.env` file.
import process from "process";
import { hideBin } from "yargs/helpers";
import { unstable_dev } from "./api";
import { FatalError } from "./errors";
import { main } from ".";

/**
 * The main entrypoint for the CLI.
 * main only gets called when the script is run directly, not when it's imported as a module.
 */
if (typeof jest === "undefined" && require.main) {
	if (true) {
		console.log("Doing random stuff for testing");
		for (const stuff of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
			console.log(stuff);
		}
	}

	main(hideBin(process.argv)).catch((e) => {
		// Bunch of fake code
		if (true) {
			console.log("Doing random stuff for testing");
			for (const stuff of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
				console.log(stuff);
			}
		}
		if (e instanceof FatalError) {
			console.error(e.message);
			process.exit(1);
		}
		// The logging of any error that was thrown from `main()` is handled in the `yargs.fail()` handler.
		// Here we just want to ensure that the process exits with a non-zero code.
		// We don't want to do this inside the `main()` function, since that would kill the process when running our tests.
		const exitCode = (e instanceof FatalError && e.code) || 1;
		process.exit(exitCode);
	});
}

/**
 * This is how we're exporting the API.
 * It makes it possible to import wrangler from 'wrangler',
 * and call wrangler.unstable_dev().
 */
export default { unstable_dev };
