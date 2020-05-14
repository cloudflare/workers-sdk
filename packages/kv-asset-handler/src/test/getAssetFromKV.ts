import test from 'ava'
import { mockGlobal, getEvent, sleep, mockKV, mockManifest } from '../mocks'
import { getAssetFromKV, mapRequestToAsset } from '../index'
import { KVError } from '../types'

test('getAssetFromKV return correct val from KV and default caching', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/key1.txt'))
  const res = await getAssetFromKV(event)

  if (res) {
    t.is(res.headers.get('cache-control'), null)
    t.is(res.headers.get('cf-cache-status'), 'MISS')
    t.is(await res.text(), 'val1')
    t.true(res.headers.get('content-type').includes('text'))
  } else {
    t.fail('Response was undefined')
  }
})
test('getAssetFromKV evaluated the file matching the extensionless path first /client/ -> client', async t => {
  mockGlobal()
  const event = getEvent(new Request(`https://foo.com/client/`))
  const res = await getAssetFromKV(event)
  t.is(await res.text(), 'important file')
  t.true(res.headers.get('content-type').includes('text'))
})
test('getAssetFromKV evaluated the file matching the extensionless path first /client -> client', async t => {
  mockGlobal()
  const event = getEvent(new Request(`https://foo.com/client`))
  const res = await getAssetFromKV(event)
  t.is(await res.text(), 'important file')
  t.true(res.headers.get('content-type').includes('text'))
})

test('getAssetFromKV if not in asset manifest still returns nohash.txt', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/nohash.txt'))
  const res = await getAssetFromKV(event)

  if (res) {
    t.is(await res.text(), 'no hash but still got some result')
    t.true(res.headers.get('content-type').includes('text'))
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV if no asset manifest /client -> client fails', async t => {
  mockGlobal()
  const event = getEvent(new Request(`https://foo.com/client`))
  const error: KVError = await t.throwsAsync(getAssetFromKV(event, { ASSET_MANIFEST: {} }))
  t.is(error.status, 404)
})

test('getAssetFromKV if sub/ -> sub/index.html served', async t => {
  mockGlobal()
  const event = getEvent(new Request(`https://foo.com/sub`))
  const res = await getAssetFromKV(event)
  if (res) {
    t.is(await res.text(), 'picturedis')
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV gets index.html by default for / requests', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/'))
  const res = await getAssetFromKV(event)

  if (res) {
    t.is(await res.text(), 'index.html')
    t.true(res.headers.get('content-type').includes('html'))
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV custom key modifier', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/docs/sub/blah.png'))

  const customRequestMapper = (request: Request) => {
    let defaultModifiedRequest = mapRequestToAsset(request)

    let url = new URL(defaultModifiedRequest.url)
    url.pathname = url.pathname.replace('/docs', '')
    return new Request(url.toString(), request)
  }

  const res = await getAssetFromKV(event, { mapRequestToAsset: customRequestMapper })

  if (res) {
    t.is(await res.text(), 'picturedis')
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV when setting browser caching', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/'))

  const res = await getAssetFromKV(event, { cacheControl: { browserTTL: 22 } })

  if (res) {
    t.is(res.headers.get('cache-control'), 'max-age=22')
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV when setting custom cache setting', async t => {
  mockGlobal()
  const event1 = getEvent(new Request('https://blah.com/'))
  const event2 = getEvent(new Request('https://blah.com/key1.png?blah=34'))
  const cacheOnlyPngs = (req: Request) => {
    if (new URL(req.url).pathname.endsWith('.png'))
      return {
        browserTTL: 720,
        edgeTTL: 720,
      }
    else
      return {
        bypassCache: true,
      }
  }

  const res1 = await getAssetFromKV(event1, { cacheControl: cacheOnlyPngs })
  const res2 = await getAssetFromKV(event2, { cacheControl: cacheOnlyPngs })

  if (res1 && res2) {
    t.is(res1.headers.get('cache-control'), null)
    t.true(res2.headers.get('content-type').includes('png'))
    t.is(res2.headers.get('cache-control'), 'max-age=720')
    t.is(res2.headers.get('cf-cache-status'), 'MISS')
  } else {
    t.fail('Response was undefined')
  }
})
test('getAssetFromKV caches on two sequential requests', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/cache.html'))

  const res1 = await getAssetFromKV(event, { cacheControl: { edgeTTL: 720, browserTTL: 720 } })
  await sleep(1)
  const res2 = await getAssetFromKV(event)

  if (res1 && res2) {
    t.is(res1.headers.get('cf-cache-status'), 'MISS')
    t.is(res1.headers.get('cache-control'), 'max-age=720')
    t.is(res2.headers.get('cf-cache-status'), 'HIT')
  } else {
    t.fail('Response was undefined')
  }
})
test('getAssetFromKV does not store max-age on two sequential requests', async t => {
  mockGlobal()

  const event = getEvent(new Request('https://blah.com/cache.html'))

  const res1 = await getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } })
  await sleep(100)
  const res2 = await getAssetFromKV(event)

  if (res1 && res2) {
    t.is(res1.headers.get('cf-cache-status'), 'MISS')
    t.is(res1.headers.get('cache-control'), null)
    t.is(res2.headers.get('cf-cache-status'), 'HIT')
    t.is(res2.headers.get('cache-control'), null)
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV does not cache on Cloudflare when bypass cache set', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/'))

  const res = await getAssetFromKV(event, { cacheControl: { bypassCache: true } })

  if (res) {
    t.is(res.headers.get('cache-control'), null)
    t.is(res.headers.get('cf-cache-status'), null)
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV with no trailing slash on root', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com'))
  const res = await getAssetFromKV(event)
  if (res) {
    t.is(await res.text(), 'index.html')
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV with no trailing slash on a subdirectory', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/sub/blah.png'))
  const res = await getAssetFromKV(event)
  if (res) {
    t.is(await res.text(), 'picturedis')
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV no result throws an error', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/random'))
  const error: KVError = await t.throwsAsync(getAssetFromKV(event))
  t.is(error.status, 404)
})
test('getAssetFromKV TTls set to null should not cache on browser or edge', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/'))

  const res1 = await getAssetFromKV(event, { cacheControl: { browserTTL: null, edgeTTL: null } })
  await sleep(100)
  const res2 = await getAssetFromKV(event, { cacheControl: { browserTTL: null, edgeTTL: null } })

  if (res1 && res2) {
    t.is(res1.headers.get('cf-cache-status'), null)
    t.is(res1.headers.get('cache-control'), null)
    t.is(res2.headers.get('cf-cache-status'), null)
    t.is(res2.headers.get('cache-control'), null)
  } else {
    t.fail('Response was undefined')
  }
})
test('getAssetFromKV passing in a custom NAMESPACE serves correct asset', async t => {
  mockGlobal()
  let CUSTOM_NAMESPACE = mockKV({
    'key1.123HASHBROWN.txt': 'val1',
  })
  Object.assign(global, { CUSTOM_NAMESPACE })
  const event = getEvent(new Request('https://blah.com/'))
  const res = await getAssetFromKV(event)
  if (res) {
    t.is(await res.text(), 'index.html')
    t.true(res.headers.get('content-type').includes('html'))
  } else {
    t.fail('Response was undefined')
  }
})
test('getAssetFromKV when custom namespace without the asset should fail', async t => {
  mockGlobal()
  let CUSTOM_NAMESPACE = mockKV({
    'key5.123HASHBROWN.txt': 'customvalu',
  })

  const event = getEvent(new Request('https://blah.com'))
  const error: KVError = await t.throwsAsync(
    getAssetFromKV(event, { ASSET_NAMESPACE: CUSTOM_NAMESPACE }),
  )
  t.is(error.status, 404)
})
test('getAssetFromKV when namespace not bound fails', async t => {
  mockGlobal()
  var MY_CUSTOM_NAMESPACE = undefined
  Object.assign(global, { MY_CUSTOM_NAMESPACE })

  const event = getEvent(new Request('https://blah.com/'))
  const error: KVError = await t.throwsAsync(
    getAssetFromKV(event, { ASSET_NAMESPACE: MY_CUSTOM_NAMESPACE }),
  )
  t.is(error.status, 500)
})

test('getAssetFromKV when mimetype is html is not revalidated', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com', {
    headers: {
      'if-none-match': 'blah'
    }
  }))
  const res = await getAssetFromKV(event)
  if (res) {
    t.true(res.headers.get('content-type').includes('html'))
    t.true(res.headers.has('etag') !== true)
    t.true(res.status !== 304)
  } else {
    t.fail(`Response was undefined`)
  }
})

test('getAssetFromKV when if-none-match === etag and etag === pathKey in manifest, should revalidate', async t => {
  mockGlobal()
  const resourceVersion = JSON.parse(mockManifest())['key1.png']
  const request = new Request(`https://blah.com/key1.png`, {
    headers: {
      'if-none-match': resourceVersion
    }
  })
  const event = getEvent(request)
  const res1 = await getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } })
  const res2 = await getAssetFromKV(event)

  if (res1 && res2) {
    t.is(res1.headers.get('cf-cache-status'), 'MISS')
    t.is(res2.headers.get('etag'), request.headers.get('if-none-match'))
    t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED')
    t.is(res2.status, 304)
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV when etag and if-none-match are present but if-none-match !== etag, should bypass cache', async t => {
  mockGlobal()
  const resourceVersion = JSON.parse(mockManifest())['key1.png']
  const req1 = new Request(`https://blah.com/key1.png`, {
    headers: {
      'if-none-match': resourceVersion
    }
  })
  const req2 = new Request(`https://blah.com/key1.png`, {
    headers: {
      'if-none-match': resourceVersion + "another-version"
    }
  })
  const event = getEvent(req1)
  const event2 = getEvent(req2)
  const res1 = await getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } })
  const res2 = await getAssetFromKV(event)
  const res3 = await getAssetFromKV(event2)
  if (res1 && res2 && res3) {
    t.is(res1.headers.get('cf-cache-status'), 'MISS')
    t.is(res2.headers.get('etag'), req1.headers.get('if-none-match'))
    t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED')
    t.true(res3.headers.has('etag'))
    t.true(req2.headers.has('if-none-match'))
    t.not(res3.headers.get('etag'), req2.headers.get('if-none-match'))
    t.is(res3.headers.get('cf-cache-status'), 'MISS')
  } else {
    t.fail('Response was undefined')
  }
})