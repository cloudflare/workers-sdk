import test from 'ava'
import { getAssetFromKV } from '../src/index'
import { mockGlobal } from '../src/mocks'

test('getAssetFromKV return correct val from KV', async t => {
  mockGlobal()
  const url = 'https://blah.com/key1.txt'
  const res = await getAssetFromKV(url)

  if (res) {
    t.is(await res.text(), 'val1')
  } else {
    t.fail('Response was undefined')
  }
})
test('getAssetFromKV gets index.html by default for / requests', async t => {
  mockGlobal()
  const url = 'https://blah.com/'
  const res = await getAssetFromKV(url)

  if (res) {
    t.is(await res.text(), 'index.html')
  } else {
    t.fail('Response was undefined')
  }
})
