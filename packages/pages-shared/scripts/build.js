const glob = require("glob");
const { join } = require("path");
const { build } = require("esbuild");

const srcDir = join(__dirname, "../src");
const distDir = join(__dirname, "../dist");

const matches = glob.sync(join(srcDir, "**/*"), { nodir: true });

build({
	entryPoints: matches,
	outdir: join(distDir),
});
