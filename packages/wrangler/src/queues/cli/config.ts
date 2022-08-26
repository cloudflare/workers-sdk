import path from "path";
import { type Config, readConfig, findWranglerToml } from "../../config";

export interface Args {
	config?: string;
	script?: string;
}

export function read(args: Args): Config {
	const configPath =
		args.config || (args.script && findWranglerToml(path.dirname(args.script)));
	return readConfig(configPath, args);
}
