// Emulated Ratelimit Binding

// ENV configuration
interface RatelimitConfig {
  namespaceId: number
  limit: number
  period: number
}

// options for Ratelimit
//   (should be kept in sync with https://bitbucket.cfdata.org/projects/EW/repos/edgeworker/browse/src/edgeworker/internal-api/ratelimit.capnp)
interface RatelimitOptions {
  key?: string
  limit?: number
  period?: number
}
const RatelimitOptionKeys = ['key', 'limit', 'period']
const RatelimitPeriodValues = [ 10, 60 ]

// result from Ratelimit call
//   (should be kept in sync with https://bitbucket.cfdata.org/projects/EW/repos/edgeworker/browse/src/edgeworker/internal-api/ratelimit.capnp)
interface RatelimitResult {
  success: boolean
}

function validate(test: boolean, message: string) {
    if (!test) {
        console.log(message)
        throw new Error(message)
    }
}

class Ratelimit {
  namespaceId: number
  limitVal: number
  period: number
  buckets: Map<string, number>
  epoch: number

  constructor(config: RatelimitConfig) {
    this.namespaceId = config.namespaceId
    this.limitVal = config.limit
    this.period = config.period

    this.buckets = new Map<string,number>()
    this.epoch = 0
  }

  // method that counts and checks against the limit in in-memory buckets
  async limit(options: unknown): Promise<RatelimitResult> {
    // validate options input
    validate(typeof(options)=='object', 'invalid rate limit options')
    const invalidProps = Object.keys(options || {}).filter((key) => !RatelimitOptionKeys.includes(key))
    validate(invalidProps.length==0, `Bad rate limit options: [${invalidProps.join(',')}]`)
    // eslint-disable-next-line prefer-const
    let { key, limit, period } = options as RatelimitOptions;
    validate(!key || typeof(key) == 'string', `invalid key: ${key}`)
    validate(!limit || typeof(limit) == 'number', `limit must be a number: ${limit}`)
    validate(!period || typeof(period) == 'number', `period must be a number: ${period}`)
    validate(!period || RatelimitPeriodValues.includes(period), `unsupported period: ${period}`)

    key = key || ""
    period = period || this.period
    limit = limit || this.limitVal
    const epoch = Math.floor(Date.now()/(period*1000))
    if (epoch != this.epoch) {
      // clear counters
      this.epoch = epoch
      this.buckets.clear()
    }
    const val = this.buckets.get(key) || 0
    if (val>=limit) {
      return {
        success: false
      }
    }
    this.buckets.set(key, val+1)
    return {
      success: true
    }
  }
}

// create a new Ratelimit
export default function(env: RatelimitConfig) {
  return new Ratelimit(env)
}
