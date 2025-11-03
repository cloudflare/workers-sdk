import { Astro } from "./astro";
import { Static } from "./static";
import type { AutoConfigDetails } from "../types";
import type { RawConfig } from "@cloudflare/workers-utils";

export abstract class Framework {
	abstract name: string;

	abstract configure(
		options: AutoConfigDetails
	): Promise<RawConfig> | RawConfig;
}

export function getFramework(id: string) {
	if (id === "astro") {
		return new Astro();
	}

	return new Static(id);
}
