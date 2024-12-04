import path from "path";
import { findWranglerConfig, readConfig } from "../../config";

export function getConfig<
	T extends {
		name?: string;
		config?: string;
	},
>(args: Pick<T, "config" | "name">) {
	const configPath =
		args.config || (args.name && findWranglerConfig(path.dirname(args.name)));
	return readConfig(configPath, args);
}
