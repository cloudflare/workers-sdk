/**
 * Launch pnpm's JavaScript entry point with Node or its native binary directly.
 *
 * @param {string} pnpmPath The npm_execpath provided by pnpm.
 * @param {string[]} args Arguments to pass to pnpm.
 * @returns {[string, ...string[]]} The executable followed by its arguments.
 */
function getPnpmCommand(pnpmPath, args) {
	return /\.[cm]?js$/.test(pnpmPath)
		? [process.execPath, pnpmPath, ...args]
		: [pnpmPath, ...args];
}

exports.getPnpmCommand = getPnpmCommand;
