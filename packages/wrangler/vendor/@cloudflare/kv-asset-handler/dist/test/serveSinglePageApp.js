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
function testRequest(path) {
    mocks_1.mockGlobal();
    let url = new URL('https://example.com');
    url.pathname = path;
    let request = new Request(url.toString());
    return request;
}
ava_1.default('serveSinglePageApp returns root asset path when request path ends in .html', (t) => __awaiter(void 0, void 0, void 0, function* () {
    let path = '/foo/thing.html';
    let request = testRequest(path);
    let expected_request = testRequest('/index.html');
    let actual_request = index_1.serveSinglePageApp(request);
    t.deepEqual(expected_request, actual_request);
}));
ava_1.default('serveSinglePageApp returns root asset path when request path does not have extension', (t) => __awaiter(void 0, void 0, void 0, function* () {
    let path = '/foo/thing';
    let request = testRequest(path);
    let expected_request = testRequest('/index.html');
    let actual_request = index_1.serveSinglePageApp(request);
    t.deepEqual(expected_request, actual_request);
}));
ava_1.default('serveSinglePageApp returns requested asset when request path has non-html extension', (t) => __awaiter(void 0, void 0, void 0, function* () {
    let path = '/foo/thing.js';
    let request = testRequest(path);
    let expected_request = request;
    let actual_request = index_1.serveSinglePageApp(request);
    t.deepEqual(expected_request, actual_request);
}));
