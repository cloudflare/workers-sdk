import { execSync, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

// TODO (someday): Figure out why the dts and js generators fail on rtti.capnp files
execSync("capnp-es scripts/rtti/rtti.capnp -ots");

spawnSync(
	"esbuild --bundle --platform=node scripts/rtti/rtti.ts --outfile=scripts/rtti/rtti.js"
);
rmSync("scripts/rtti/rtti.ts");
