#!/usr/bin/env node

import type { Argv } from 'create-cloudflare';

const argv = require('mri')(process.argv.slice(2), {
	alias: {
		v: 'version',
		h: 'help',
	},
	default: {
		init: true,
		force: false,
		debug: false,
	},
}) as Argv & {
	_: string[];
	help?: boolean;
	version?: boolean;
};

function exit(msg: string, code = 1): never {
	if (code) console.error('\n' + msg + '\n');
	else console.log('\n' + msg + '\n');
	process.exit(code);
}

if (argv.help) {
	let output = '';

	output += '\n  Usage';
	output += '\n    npm init cloudflare <directory> <source> -- [options]';
	output += '\n    pnpm create cloudflare <directory> <source> [options]';
	output += '\n    yarn create cloudflare <directory> <source> [options]';
	output += '\n';
	output += '\n  Sources';
	output += '\n    • Example — A name or path to an official example subdirectory.';
	output += '\n        Visit https://github.com/cloudflare/templates for options'; // TODO(future): gallery view
	output += '\n    • URL — Any valid git repository address.';
	output += '\n        [user@]host.xz:path/to/repo.git[#branch]';
	output += '\n        git://host.xz[:port]/path/to/repo.git[#branch]';
	output += '\n        ssh://[user@]host.xz[:port]/path/to/repo.git[#branch]';
	output += '\n        http[s]://host.xz[:port]/path/to/repo.git[#branch]';
	output += '\n        ftp[s]://host.xz[:port]/path/to/repo.git[#branch]';
	output += '\n';
	output += '\n  Options';
	output += '\n    --force         Force overwrite target directory';
	output += '\n    --no-init       Do not initialize a git repository';
	output += '\n    --debug         Print additional error details';
	output += '\n    --version, -v   Displays current version';
	output += '\n    --help, -h      Displays this message';
	output += '\n';
	output += '\n  Examples';
	output += '\n    $ npm init cloudflare my-project pages/svelte-kit -- --debug';
	output += '\n    $ yarn create cloudflare my-project workshops/intro-workers --force';
	output += '\n    $ pnpm create cloudflare my-project https://github.com/user/repo.git#branch';
	output += '\n    $ npm init cloudflare my-project https://github.com/user/repo.git';
	output += '\n';

	exit(output, 0);
}

if (argv.version) {
	let pkg = require('./package.json');
	exit(`${pkg.name}, v${pkg.version}`, 0);
}

(async function () {
	try {
		let [dir, source] = argv._;
		if (!dir) return exit('Missing <directory> argument', 1);
		if (!source) return exit('Missing <source> argument', 1);
		await require('.').setup(dir, source, argv);
	} catch (err) {
		exit(err instanceof Error ? err.stack || err.message : (err as string), 1);
	}
})();
