import { crash } from "@cloudflare/cli";
import clisPackageJson from "./package.json";
import type { C3Context } from "types";

export const getFrameworkCli = (ctx: C3Context, withVersion = true) => {
	if (!ctx.template) {
		return crash("Framework not specified.");
	}

	const framework = ctx.template
		.id as keyof typeof clisPackageJson.frameworkCliMap;
	const frameworkCli = clisPackageJson.frameworkCliMap[
		framework
	] as keyof typeof clisPackageJson.dependencies;
	const version = clisPackageJson.dependencies[frameworkCli];
	return withVersion ? `${frameworkCli}@${version}` : frameworkCli;
};
