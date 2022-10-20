import { unstable_dev, type UnstableDevWorker } from "./api/index";

/**
 * This is how we're exporting the API.
 * It makes it possible to import wrangler from 'wrangler',
 * and call wrangler.unstable_dev().
 */
export { unstable_dev };
export type { UnstableDevWorker };
