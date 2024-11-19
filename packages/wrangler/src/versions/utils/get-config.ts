import path from "path";
import { findWranglerToml, readConfig } from "../../config";

export function getConfig<
	T extends {
		name?: string;
		config?: string;
		experimentalJsonConfig?: boolean;
	},
>(args: Pick<T, "config" | "name" | "experimentalJsonConfig">) {
	const configPath =
		args.config || (args.name && findWranglerToml(path.dirname(args.name)));
	return readConfig(configPath, args);
}
