import { Astro } from "./astro";
import { Static } from "./static";

export function getFramework(id: string) {
	if (id === "astro") {
		return new Astro();
	}

	return new Static(id);
}
