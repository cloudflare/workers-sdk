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

class KVError extends Error {
  constructor(message?: string, code: number = 500) {
    super(message)
    // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
    Object.setPrototypeOf(this, new.target.prototype) // restore prototype chain
    this.name = KVError.name // stack traces display correctly now
    this.code = code
  }
  code: number
}
export class MethodNotAllowedError extends KVError {
  constructor(message: string = `Not a valid request method`, code: number = 405) {
    super(message, code)
  }
}
export class NotFoundError extends KVError {
  constructor(message: string = `Not Found`, code: number = 404) {
    super(message, code)
  }
}
export class InternalError extends KVError {
  constructor(message: string = `Internal Error in KV Asset Handler`, code: number = 500) {
    super(message, code)
  }
}
