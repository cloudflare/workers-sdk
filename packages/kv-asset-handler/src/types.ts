export type CacheControl = {
  browserTTL: number
  edgeTTL: number
  bypassCache: boolean
}
export type Options = {
  cacheControl: ((req: Request) => Partial<CacheControl>) | Partial<CacheControl>
  ASSET_NAMESPACE: any
  ASSET_MANIFEST: any
  mapRequestToAsset: (req: Request) => Request
}
