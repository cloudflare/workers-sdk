import pages from "../remix/pages/c3";
import workers from "../remix/workers/c3";
import type { MultiPlatformTemplateConfig } from "../../src/templates";

const config: MultiPlatformTemplateConfig = {
	displayName: "Remix",
	platformVariants: { pages, workers },
};
export default config;
