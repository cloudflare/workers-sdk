import pages from "../react/pages/c3";
import workers from "../react/workers/c3";
import type { MultiPlatformTemplateConfig } from "../../src/templates";

const config: MultiPlatformTemplateConfig = {
	displayName: "Remix",
	platformVariants: { pages, workers },
};
export default config;
