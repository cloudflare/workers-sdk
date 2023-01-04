import * as utils from './utils';

// yarn create cloudflare foobar pages/nuxt
// yarn create cloudflare foobar workers-airtable
// yarn create cloudflare foobar https://.../user/repo

import type { Argv } from 'create-cloudflare';

export async function setup(dir: string, src: string, argv: Argv) {
	let cwd = process.cwd();

	if (utils.isRemote(dir)) {
		[dir, src] = [src, dir];
	}

	let target = utils.join(cwd, dir);

	if (utils.exists(target)) {
		if (argv.force) {
			if (target.startsWith(cwd)) await utils.rmdir(target);
			else
				'Refusing to manipulate the file system outside the PWD location.\nPlease specify a different target directory.';
		} else {
			let pretty = utils.relative(cwd, target);
			let msg = `Refusing to overwrite existing "${pretty}" directory.\n`;
			msg += 'Please specify a different directory or use the `--force` flag.';
			throw msg;
		}
	}

	let source = '',
		filter = '';
	if (utils.isRemote(src)) {
		source = src;
	} else {
		source = 'https://github.com/cloudflare/templates.git';
		filter = src;
	}

	await utils.clone({ source, filter }, target, argv);

	target = utils.relative(cwd, target);
	console.log(`\n    Success 🎉\n    Your "${target}" directory is ready for you~!\n`);
}
