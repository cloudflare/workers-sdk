// -- Constants for manifest encoding/decoding --
// (header and tails are not currently being used for anything afaik)
// NB these all refer to bytes

/** Reserved header at the start of the whole manifest, NOT in each entry (currently unused)
 * manifest = [HEADER, [ entry = PATH_HASH, CONTENT_HASH, TAIL], [entry], ... , [entry] ]
 */
export const HEADER_SIZE = 20;
/** manifest = [HEADER, [ entry = PATH_HASH, CONTENT_HASH, TAIL], [entry], ... , [entry] ] */
export const PATH_HASH_SIZE = 16;
/** manifest = [HEADER, [ entry = PATH_HASH, CONTENT_HASH, TAIL], [entry], ... , [entry] ] */
export const CONTENT_HASH_SIZE = 16;
/** manifest = [HEADER, [ entry = PATH_HASH, CONTENT_HASH, TAIL], [entry], ... , [entry] ] */
export const TAIL_SIZE = 8;
/** offset of PATH_HASH from start of each entry
 *  manifest = [HEADER, [ entry = PATH_HASH, CONTENT_HASH, TAIL], [entry], ... , [entry] ] */
export const PATH_HASH_OFFSET = 0;
/** offset of CONTENT_HASH from start of each entry
 *  manifest = [HEADER, [ entry = PATH_HASH, CONTENT_HASH, TAIL], [entry], ... , [entry] ] */
export const CONTENT_HASH_OFFSET = PATH_HASH_SIZE;
/** manifest = [HEADER, [ entry = PATH_HASH, CONTENT_HASH, TAIL], [entry], ... , [entry] ] */
export const ENTRY_SIZE = PATH_HASH_SIZE + CONTENT_HASH_SIZE + TAIL_SIZE;

// -- Manifest creation constants --
// used in wrangler dev and deploy
/** Maximum number of assets that can be deployed with a worker */
export const MAX_ASSET_COUNT = 20_000;
/** Maximum size per asset that can be deployed with a worker */
export const MAX_ASSET_SIZE = 25 * 1024 * 1024;
