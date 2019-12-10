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

export class KVError extends Error {
  constructor(message?: string, code: number = 500) {
    super(message)
    // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
    Object.setPrototypeOf(this, new.target.prototype) // restore prototype chain
    this.name = KVError.name // stack traces display correctly now
    this.code = code
  }
  code: number
}
