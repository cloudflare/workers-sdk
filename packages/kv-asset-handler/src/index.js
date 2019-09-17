import mime from "mime/lite";

class AssetWorker {
  async condition(request) {
    if (request.method === "GET" && typeof __STATIC_CONTENT !== undefined) {
      // TODO
      // and manifest exists
      // and path is in manifest
      return true;
    }
    return false;
  }

  async handler(request) {
    const cache = caches.default;
    const pathname = new URL(request.url).pathname.slice(1);
    // TODO: match cache on manifest
    let response = await cache.match(request);

    if (!response) {
      const mimeType = mime.getType(pathname);
      const body = await __STATIC_CONTENT.get(
        //assetManifest[pathname],
        pathname,
        "arrayBuffer"
      );

      // TODO: what should we do when body is empty?

      response = new Response(body);
      response.headers.set("Content-Type", mimeType);

      // TODO: add browser caching
      // if (cachePaths.some(cachePath => minimatch(path, cachePath))) {
      // 	response.headers.set("Cache-Control", "max-age=31536000, immutable");
      // 	event.waitUntil(cache.put(req, res));
      // }
    }

    return response;
  }
}

export { AssetWorker };
