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
ava_1.default('mapRequestToAsset() correctly changes /about -> /about/index.html', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    let path = '/about';
    let request = new Request(`https://foo.com${path}`);
    let newRequest = index_1.mapRequestToAsset(request);
    t.is(newRequest.url, request.url + '/index.html');
}));
ava_1.default('mapRequestToAsset() correctly changes /about/ -> /about/index.html', (t) => __awaiter(void 0, void 0, void 0, function* () {
    let path = '/about/';
    let request = new Request(`https://foo.com${path}`);
    let newRequest = index_1.mapRequestToAsset(request);
    t.is(newRequest.url, request.url + 'index.html');
}));
ava_1.default('mapRequestToAsset() correctly changes /about.me/ -> /about.me/index.html', (t) => __awaiter(void 0, void 0, void 0, function* () {
    let path = '/about.me/';
    let request = new Request(`https://foo.com${path}`);
    let newRequest = index_1.mapRequestToAsset(request);
    t.is(newRequest.url, request.url + 'index.html');
}));
ava_1.default('mapRequestToAsset() correctly changes /about -> /about/default.html', (t) => __awaiter(void 0, void 0, void 0, function* () {
    mocks_1.mockGlobal();
    let path = '/about';
    let request = new Request(`https://foo.com${path}`);
    let newRequest = index_1.mapRequestToAsset(request, { defaultDocument: 'default.html' });
    t.is(newRequest.url, request.url + '/default.html');
}));
