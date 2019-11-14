export type CacheControl = {
  browserTTL: number | null
  edgeTTL: number
  bypassCache: boolean
}
export type Options = {
  cacheControl: ((req: Request) => CacheControl) | CacheControl
  ASSET_NAMESPACE: any
  ASSET_MANIFEST: any
  mapRequestToAsset: (req: Request) => Request
}
