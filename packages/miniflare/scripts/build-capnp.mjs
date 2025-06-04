import { execSync } from "node:child_process";
import { copyFileSync } from "node:fs";

execSync("capnp-es node_modules/workerd/workerd.capnp -ots");

copyFileSync(
	"node_modules/workerd/workerd.ts",
	"src/runtime/config/generated.ts"
);
