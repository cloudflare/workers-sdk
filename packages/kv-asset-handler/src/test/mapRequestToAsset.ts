import test from 'ava'
import { mockGlobal } from '../mocks'
import { mapRequestToAsset } from '../index'

test('mapRequestToAsset() correctly changes /about -> /about/index.html', async (t) => {
  mockGlobal()
  let path = '/about'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = mapRequestToAsset(request)
  t.is(newRequest.url, request.url + '/index.html')
})

test('mapRequestToAsset() correctly changes /about/ -> /about/index.html', async (t) => {
  let path = '/about/'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = mapRequestToAsset(request)
  t.is(newRequest.url, request.url + 'index.html')
})

test('mapRequestToAsset() correctly changes /about.me/ -> /about.me/index.html', async (t) => {
  let path = '/about.me/'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = mapRequestToAsset(request)
  t.is(newRequest.url, request.url + 'index.html')
})

test('mapRequestToAsset() correctly changes /about -> /about/default.html', async (t) => {
  mockGlobal()
  let path = '/about'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = mapRequestToAsset(request, { defaultDocument: 'default.html' })
  t.is(newRequest.url, request.url + '/default.html')
})
