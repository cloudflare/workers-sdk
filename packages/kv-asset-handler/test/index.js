import test from 'ava'
import { getAssetFromKV } from '../src/index'
import { mockGlobal } from '../src/mocks'

const getEvent = request => {
  const waitUntil = callback => {
    console.log('putting to cache')
  }
  return {
    request,
    waitUntil,
  }
}

test('getAssetFromKV return correct val from KV', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/key1.txt'))
  const res = await getAssetFromKV(event)

  if (res) {
    t.is(await res.text(), 'val1')
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
  } else {
    t.fail('Response was undefined')
  }
})

test('getAssetFromKV custom key modifier', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/docs/index.html'))

  const customKeyModifier = pathname => {
    if (pathname === '/') {
      pathname += 'index.html'
    }
    return pathname.replace('/docs', '')
  }

  const res = await getAssetFromKV(event, { keyModifier: customKeyModifier })

  if (res) {
    t.is(await res.text(), 'index.html')
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

test('getAssetFromKV no result throws an error', async t => {
  mockGlobal()
  const event = getEvent(new Request('https://blah.com/random'))
  await t.throwsAsync(getAssetFromKV(event))
})
