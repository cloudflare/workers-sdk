var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __export = (target, all) => {
  __markAsModule(target);
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../node_modules/@remix-run/dev/compiler/shims/react.ts
import * as React from "react";

// app/entry.server.tsx
var entry_server_exports = {};
__export(entry_server_exports, {
  default: () => handleRequest
});
import React2 from "react";
import { renderToString } from "react-dom/server";

// ../../node_modules/remix/esm/client.js
import { Form, Link, Links, LiveReload, Meta, NavLink, Outlet, PrefetchPageLinks, RemixBrowser, RemixServer, Scripts, ScrollRestoration, useActionData, useBeforeUnload, useCatch, useFetcher, useFetchers, useFormAction, useHref, useLoaderData, useLocation, useMatches, useNavigate, useNavigationType, useOutlet, useOutletContext, useParams, useResolvedPath, useSearchParams, useSubmit, useTransition } from "@remix-run/react";

// app/entry.server.tsx
function handleRequest(request, responseStatusCode, responseHeaders, remixContext) {
  const markup = renderToString(/* @__PURE__ */ React2.createElement(RemixServer, {
    context: remixContext,
    url: request.url
  }));
  responseHeaders.set("Content-Type", "text/html");
  return new Response("<!DOCTYPE html>" + markup, {
    status: responseStatusCode,
    headers: responseHeaders
  });
}

// route-module:/Users/msilverlock/repos/wrangler2/examples/remix-pages-app/app/root.tsx
var root_exports = {};
__export(root_exports, {
  default: () => App,
  meta: () => meta
});
import React3 from "react";
var meta = () => {
  return { title: "New Remix App" };
};
function App() {
  return /* @__PURE__ */ React3.createElement("html", {
    lang: "en"
  }, /* @__PURE__ */ React3.createElement("head", null, /* @__PURE__ */ React3.createElement("meta", {
    charSet: "utf-8"
  }), /* @__PURE__ */ React3.createElement("meta", {
    name: "viewport",
    content: "width=device-width,initial-scale=1"
  }), /* @__PURE__ */ React3.createElement(Meta, null), /* @__PURE__ */ React3.createElement(Links, null)), /* @__PURE__ */ React3.createElement("body", null, /* @__PURE__ */ React3.createElement(Outlet, null), /* @__PURE__ */ React3.createElement(ScrollRestoration, null), /* @__PURE__ */ React3.createElement(Scripts, null), false));
}

// route-module:/Users/msilverlock/repos/wrangler2/examples/remix-pages-app/app/routes/index.tsx
var routes_exports = {};
__export(routes_exports, {
  default: () => Index
});
import React4 from "react";
function Index() {
  return /* @__PURE__ */ React4.createElement("div", {
    style: { fontFamily: "system-ui, sans-serif", lineHeight: "1.4" }
  }, /* @__PURE__ */ React4.createElement("h1", null, "Welcome to Remix"), /* @__PURE__ */ React4.createElement("ul", null, /* @__PURE__ */ React4.createElement("li", null, /* @__PURE__ */ React4.createElement("a", {
    target: "_blank",
    href: "https://remix.run/tutorials/blog",
    rel: "noreferrer"
  }, "15m Quickstart Blog Tutorial")), /* @__PURE__ */ React4.createElement("li", null, /* @__PURE__ */ React4.createElement("a", {
    target: "_blank",
    href: "https://remix.run/tutorials/jokes",
    rel: "noreferrer"
  }, "Deep Dive Jokes App Tutorial")), /* @__PURE__ */ React4.createElement("li", null, /* @__PURE__ */ React4.createElement("a", {
    target: "_blank",
    href: "https://remix.run/docs",
    rel: "noreferrer"
  }, "Remix Docs"))));
}

// <stdin>
import { default as default2 } from "./assets.json";
var entry = { module: entry_server_exports };
var routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: root_exports
  },
  "routes/index": {
    id: "routes/index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: routes_exports
  }
};
export {
  default2 as assets,
  entry,
  routes
};
/**
 * @remix-run/react v1.1.3
 *
 * Copyright (c) Remix Software Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */
