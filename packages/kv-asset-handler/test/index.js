import test from 'ava'
import { getAssetFromKV } from '../src/index'
import { mockGlobal } from '../src/mocks'

test('getAssetFromKV return correct val from KV', async t => {
  mockGlobal()
  const req = new Request('https://blah.com/key1.txt')
  const res = await getAssetFromKV(req)

  if (res) {
    t.is(await res.text(), 'val1')
  } else {
    t.fail('Response was undefined')
  }
})
test('getAssetFromKV gets index.html by default for / requests', async t => {
  mockGlobal()
  const req = new Request('https://blah.com/')
  const res = await getAssetFromKV(req)

  if (res) {
    t.is(await res.text(), 'index.html')
  } else {
    t.fail('Response was undefined')
  }
})
test('getAssetFromKV custom key modifier', async t => {
  mockGlobal()
  const req = new Request('https://blah.com/docs/')

  const customKeyModifier = url => {
    if (url.endsWith('/')) url += 'index.html'
    return url.replace('/docs', '')
  }

  const res = await getAssetFromKV(req, customKeyModifier)

  if (res) {
    t.is(await res.text(), 'index.html')
  } else {
    t.fail('Response was undefined')
  }
})
test('getAssetFromKV with no trailing slash on root', async t => {
  mockGlobal()
  const req = new Request('https://blah.com')
  const res = await getAssetFromKV(req)
  if (res) {
    t.is(await res.text(), 'index.html')
  } else {
    t.fail('Response was undefined')
  }
})
test('getAssetFromKV no result throws an error', async t => {
  mockGlobal()
  const req = new Request('https://blah.com/random')
  await t.throwsAsync(getAssetFromKV(req))
})
