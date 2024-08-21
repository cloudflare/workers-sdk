export const HEADER_SIZE = 20;
export const PATH_HASH_SIZE = 16;
export const CONTENT_HASH_SIZE = 16;
export const TAIL_SIZE = 8;
export const ENTRY_SIZE = PATH_HASH_SIZE + CONTENT_HASH_SIZE + TAIL_SIZE;
export const PATH_HASH_OFFSET = 0;
export const CONTENT_HASH_OFFSET = PATH_HASH_SIZE;

// constants same as Pages for now
export const MAX_ASSET_COUNT = 20_000;
export const MAX_ASSET_SIZE = 25 * 1024 * 1024;
