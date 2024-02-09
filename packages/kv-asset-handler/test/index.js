import test from 'ava'
import { getAssetFromKV, defaultKeyModifier } from '../src/index'
import { mockGlobal } from '../src/mocks'

const getEvent = request => {
  const waitUntil = callback => {}
  return {
    request,
    waitUntil,
  }
}

test('defaultKeyModifier() correctly changes /about -> /about/index.html', async t => {
  mockGlobal()
  let path = '/about'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = defaultKeyModifier(request)
  let keyURL = new URL(newRequest.url)
  let key = keyURL.pathname
  t.is(key, '/about/index.html')
})

test('defaultKeyModifier() correctly changes /about/ -> /about/index.html', async t => {
  let path = '/about/'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = defaultKeyModifier(request)
  let keyURL = new URL(newRequest.url)
  let key = keyURL.pathname
  t.is(key, '/about/index.html')
})

test('defaultKeyModifier() correctly changes /about.me/ -> /about.me/index.html', async t => {
  let path = '/about.me/'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = defaultKeyModifier(request)
  let keyURL = new URL(newRequest.url)
  let key = keyURL.pathname
  t.is(key, '/about.me/index.html')
})

test('getAssetFromKV return correct val from KV and default caching', async t => {
  const event = getEvent(new Request('https://blah.com/key1.txt'))
  const res = await getAssetFromKV(event)

  if (res) {
    t.is(res.headers.get('cache-control'), null)
    t.is(res.headers.get('Cf-Cache-Status'), 'MISS')
    t.is(await res.text(), 'val1')
    t.true(res.headers.get('content-type').includes('text'))
  } else {
    t.fail('Response was undefined')
  }
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

  const customKeyModifier = request => {
    const parsedUrl = new URL(request.url)
    // determine the file path to search for from the pathname of the incoming request
    let pathname = parsedUrl.pathname

    if (pathname.endsWith('/')) {
      pathname += 'index.html'
    }

    let url = new URL(request.url)
    url.pathname = pathname.replace('/docs', '').replace(/^\/+/, '')
    return new Request(url, request)
  }

  const res = await getAssetFromKV(event, { keyModifier: customKeyModifier })

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

test('getAssetFromKV when setting custom cache setting ', async t => {
  mockGlobal()
  const event1 = getEvent(new Request('https://blah.com/'))
  const event2 = getEvent(new Request('https://blah.com/key1.png?blah=34'))
  const cacheOnlyPngs = req => {
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
    t.is(res2.headers.get('Cf-Cache-Status'), 'MISS')
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
    t.is(res.headers.get('Cf-Cache-Status'), null)
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
  await t.throwsAsync(getAssetFromKV(event))
})
