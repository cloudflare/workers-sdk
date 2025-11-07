import type { MultiPlatformTemplateConfig } from "../../src/templates";

import pages from "./pages/c3";
import workers from "./workers/c3";

const config: MultiPlatformTemplateConfig = {
	displayName: "Nuxt",
	platformVariants: { pages, workers },
};
export default config;
