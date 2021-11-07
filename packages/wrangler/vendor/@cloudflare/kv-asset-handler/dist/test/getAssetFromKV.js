"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = require("ava");
const mocks_1 = require("../mocks");
const index_1 = require("../index");
ava_1.default('getAssetFromKV return correct val from KV and default caching', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/key1.txt'));
    const res = yield index_1.getAssetFromKV(event);
    if (res) {
        t.is(res.headers.get('cache-control'), null);
        t.is(res.headers.get('cf-cache-status'), 'MISS');
        t.is(yield res.text(), 'val1');
        t.true(res.headers.get('content-type').includes('text'));
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV evaluated the file matching the extensionless path first /client/ -> client', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request(`https://foo.com/client/`));
    const res = yield index_1.getAssetFromKV(event);
    t.is(yield res.text(), 'important file');
    t.true(res.headers.get('content-type').includes('text'));
}));
ava_1.default('getAssetFromKV evaluated the file matching the extensionless path first /client -> client', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request(`https://foo.com/client`));
    const res = yield index_1.getAssetFromKV(event);
    t.is(yield res.text(), 'important file');
    t.true(res.headers.get('content-type').includes('text'));
}));
ava_1.default('getAssetFromKV if not in asset manifest still returns nohash.txt', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/nohash.txt'));
    const res = yield index_1.getAssetFromKV(event);
    if (res) {
        t.is(yield res.text(), 'no hash but still got some result');
        t.true(res.headers.get('content-type').includes('text'));
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV if no asset manifest /client -> client fails', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request(`https://foo.com/client`));
    const error = yield t.throwsAsync(index_1.getAssetFromKV(event, { ASSET_MANIFEST: {} }));
    t.is(error.status, 404);
}));
ava_1.default('getAssetFromKV if sub/ -> sub/index.html served', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request(`https://foo.com/sub`));
    const res = yield index_1.getAssetFromKV(event);
    if (res) {
        t.is(yield res.text(), 'picturedis');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV gets index.html by default for / requests', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/'));
    const res = yield index_1.getAssetFromKV(event);
    if (res) {
        t.is(yield res.text(), 'index.html');
        t.true(res.headers.get('content-type').includes('html'));
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV non ASCII path support', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/测试.html'));
    const res = yield index_1.getAssetFromKV(event);
    if (res) {
        t.is(yield res.text(), 'My filename is non-ascii');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV supports browser percent encoded URLs', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://example.com/%not-really-percent-encoded.html'));
    const res = yield index_1.getAssetFromKV(event);
    if (res) {
        t.is(yield res.text(), 'browser percent encoded');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV supports user percent encoded URLs', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/%2F.html'));
    const res = yield index_1.getAssetFromKV(event);
    if (res) {
        t.is(yield res.text(), 'user percent encoded');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV only decode URL when necessary', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event1 = mocks_1.getEvent(new Request('https://blah.com/%E4%BD%A0%E5%A5%BD.html'));
    const event2 = mocks_1.getEvent(new Request('https://blah.com/你好.html'));
    const res1 = yield index_1.getAssetFromKV(event1);
    const res2 = yield index_1.getAssetFromKV(event2);
    if (res1 && res2) {
        t.is(yield res1.text(), 'Im important');
        t.is(yield res2.text(), 'Im important');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV Support for user decode url path', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event1 = mocks_1.getEvent(new Request('https://blah.com/%E4%BD%A0%E5%A5%BD/'));
    const event2 = mocks_1.getEvent(new Request('https://blah.com/你好/'));
    const res1 = yield index_1.getAssetFromKV(event1);
    const res2 = yield index_1.getAssetFromKV(event2);
    if (res1 && res2) {
        t.is(yield res1.text(), 'My path is non-ascii');
        t.is(yield res2.text(), 'My path is non-ascii');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV custom key modifier', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/docs/sub/blah.png'));
    const customRequestMapper = (request) => {
        let defaultModifiedRequest = index_1.mapRequestToAsset(request);
        let url = new URL(defaultModifiedRequest.url);
        url.pathname = url.pathname.replace('/docs', '');
        return new Request(url.toString(), request);
    };
    const res = yield index_1.getAssetFromKV(event, { mapRequestToAsset: customRequestMapper });
    if (res) {
        t.is(yield res.text(), 'picturedis');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV when setting browser caching', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/'));
    const res = yield index_1.getAssetFromKV(event, { cacheControl: { browserTTL: 22 } });
    if (res) {
        t.is(res.headers.get('cache-control'), 'max-age=22');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV when setting custom cache setting', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event1 = mocks_1.getEvent(new Request('https://blah.com/'));
    const event2 = mocks_1.getEvent(new Request('https://blah.com/key1.png?blah=34'));
    const cacheOnlyPngs = (req) => {
        if (new URL(req.url).pathname.endsWith('.png'))
            return {
                browserTTL: 720,
                edgeTTL: 720,
            };
        else
            return {
                bypassCache: true,
            };
    };
    const res1 = yield index_1.getAssetFromKV(event1, { cacheControl: cacheOnlyPngs });
    const res2 = yield index_1.getAssetFromKV(event2, { cacheControl: cacheOnlyPngs });
    if (res1 && res2) {
        t.is(res1.headers.get('cache-control'), null);
        t.true(res2.headers.get('content-type').includes('png'));
        t.is(res2.headers.get('cache-control'), 'max-age=720');
        t.is(res2.headers.get('cf-cache-status'), 'MISS');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV caches on two sequential requests', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const resourceKey = 'cache.html';
    const resourceVersion = JSON.parse(mocks_1.mockManifest())[resourceKey];
    const event1 = mocks_1.getEvent(new Request(`https://blah.com/${resourceKey}`));
    const event2 = mocks_1.getEvent(new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `"${resourceVersion}"`,
        },
    }));
    const res1 = yield index_1.getAssetFromKV(event1, { cacheControl: { edgeTTL: 720, browserTTL: 720 } });
    yield mocks_1.sleep(1);
    const res2 = yield index_1.getAssetFromKV(event2);
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res1.headers.get('cache-control'), 'max-age=720');
        t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV does not store max-age on two sequential requests', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const resourceKey = 'cache.html';
    const resourceVersion = JSON.parse(mocks_1.mockManifest())[resourceKey];
    const event1 = mocks_1.getEvent(new Request(`https://blah.com/${resourceKey}`));
    const event2 = mocks_1.getEvent(new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `"${resourceVersion}"`,
        },
    }));
    const res1 = yield index_1.getAssetFromKV(event1, { cacheControl: { edgeTTL: 720 } });
    yield mocks_1.sleep(100);
    const res2 = yield index_1.getAssetFromKV(event2);
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res1.headers.get('cache-control'), null);
        t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED');
        t.is(res2.headers.get('cache-control'), null);
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV does not cache on Cloudflare when bypass cache set', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/'));
    const res = yield index_1.getAssetFromKV(event, { cacheControl: { bypassCache: true } });
    if (res) {
        t.is(res.headers.get('cache-control'), null);
        t.is(res.headers.get('cf-cache-status'), null);
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV with no trailing slash on root', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com'));
    const res = yield index_1.getAssetFromKV(event);
    if (res) {
        t.is(yield res.text(), 'index.html');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV with no trailing slash on a subdirectory', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/sub/blah.png'));
    const res = yield index_1.getAssetFromKV(event);
    if (res) {
        t.is(yield res.text(), 'picturedis');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV no result throws an error', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/random'));
    const error = yield t.throwsAsync(index_1.getAssetFromKV(event));
    t.is(error.status, 404);
}));
ava_1.default('getAssetFromKV TTls set to null should not cache on browser or edge', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const event = mocks_1.getEvent(new Request('https://blah.com/'));
    const res1 = yield index_1.getAssetFromKV(event, { cacheControl: { browserTTL: null, edgeTTL: null } });
    yield mocks_1.sleep(100);
    const res2 = yield index_1.getAssetFromKV(event, { cacheControl: { browserTTL: null, edgeTTL: null } });
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), null);
        t.is(res1.headers.get('cache-control'), null);
        t.is(res2.headers.get('cf-cache-status'), null);
        t.is(res2.headers.get('cache-control'), null);
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV passing in a custom NAMESPACE serves correct asset', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    let CUSTOM_NAMESPACE = mocks_1.mockKV({
        'key1.123HASHBROWN.txt': 'val1',
    });
    Object.assign(global, { CUSTOM_NAMESPACE });
    const event = mocks_1.getEvent(new Request('https://blah.com/'));
    const res = yield index_1.getAssetFromKV(event);
    if (res) {
        t.is(yield res.text(), 'index.html');
        t.true(res.headers.get('content-type').includes('html'));
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV when custom namespace without the asset should fail', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    let CUSTOM_NAMESPACE = mocks_1.mockKV({
        'key5.123HASHBROWN.txt': 'customvalu',
    });
    const event = mocks_1.getEvent(new Request('https://blah.com'));
    const error = yield t.throwsAsync(index_1.getAssetFromKV(event, { ASSET_NAMESPACE: CUSTOM_NAMESPACE }));
    t.is(error.status, 404);
}));
ava_1.default('getAssetFromKV when namespace not bound fails', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    var MY_CUSTOM_NAMESPACE = undefined;
    Object.assign(global, { MY_CUSTOM_NAMESPACE });
    const event = mocks_1.getEvent(new Request('https://blah.com/'));
    const error = yield t.throwsAsync(index_1.getAssetFromKV(event, { ASSET_NAMESPACE: MY_CUSTOM_NAMESPACE }));
    t.is(error.status, 500);
}));
ava_1.default('getAssetFromKV when if-none-match === active resource version, should revalidate', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const resourceKey = 'key1.png';
    const resourceVersion = JSON.parse(mocks_1.mockManifest())[resourceKey];
    const event1 = mocks_1.getEvent(new Request(`https://blah.com/${resourceKey}`));
    const event2 = mocks_1.getEvent(new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `W/"${resourceVersion}"`,
        },
    }));
    const res1 = yield index_1.getAssetFromKV(event1, { cacheControl: { edgeTTL: 720 } });
    yield mocks_1.sleep(100);
    const res2 = yield index_1.getAssetFromKV(event2);
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV when if-none-match equals etag of stale resource then should bypass cache', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const resourceKey = 'key1.png';
    const resourceVersion = JSON.parse(mocks_1.mockManifest())[resourceKey];
    const req1 = new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `"${resourceVersion}"`,
        },
    });
    const req2 = new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `"${resourceVersion}-another-version"`,
        },
    });
    const event = mocks_1.getEvent(req1);
    const event2 = mocks_1.getEvent(req2);
    const res1 = yield index_1.getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } });
    const res2 = yield index_1.getAssetFromKV(event);
    const res3 = yield index_1.getAssetFromKV(event2);
    if (res1 && res2 && res3) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res2.headers.get('etag'), `W/${req1.headers.get('if-none-match')}`);
        t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED');
        t.not(res3.headers.get('etag'), req2.headers.get('if-none-match'));
        t.is(res3.headers.get('cf-cache-status'), 'MISS');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV when resource in cache, etag should be weakened before returned to eyeball', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    const resourceKey = 'key1.png';
    const resourceVersion = JSON.parse(mocks_1.mockManifest())[resourceKey];
    const req1 = new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `"${resourceVersion}"`,
        },
    });
    const event = mocks_1.getEvent(req1);
    const res1 = yield index_1.getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } });
    const res2 = yield index_1.getAssetFromKV(event);
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res2.headers.get('etag'), `W/${req1.headers.get('if-none-match')}`);
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV if-none-match not sent but resource in cache, should return cache hit 200 OK', (t) => __awaiter(void 0, void 0, void 0, function* () {
    const resourceKey = 'cache.html';
    const event = mocks_1.getEvent(new Request(`https://blah.com/${resourceKey}`));
    const res1 = yield index_1.getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } });
    yield mocks_1.sleep(1);
    const res2 = yield index_1.getAssetFromKV(event);
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res1.headers.get('cache-control'), null);
        t.is(res2.status, 200);
        t.is(res2.headers.get('cf-cache-status'), 'HIT');
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default('getAssetFromKV if range request submitted and resource in cache, request fulfilled', (t) => __awaiter(void 0, void 0, void 0, function* () {
    const resourceKey = 'cache.html';
    const event1 = mocks_1.getEvent(new Request(`https://blah.com/${resourceKey}`));
    const event2 = mocks_1.getEvent(new Request(`https://blah.com/${resourceKey}`, { headers: { range: 'bytes=0-10' } }));
    const res1 = index_1.getAssetFromKV(event1, { cacheControl: { edgeTTL: 720 } });
    yield res1;
    yield mocks_1.sleep(2);
    const res2 = yield index_1.getAssetFromKV(event2);
    if (res2.headers.has('content-range')) {
        t.is(res2.status, 206);
    }
    else {
        t.fail('Response was undefined');
    }
}));
ava_1.default.todo('getAssetFromKV when body not empty, should invoke .cancel()');
