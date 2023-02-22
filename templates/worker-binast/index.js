async function fetchOrigin(path) {
  return fetch("https://cloudflare.github.io/binjs-demo/build" + path);
}

async function fetchOriginJS(path) {
  const res = await fetchOrigin(toExtBinJs(path));

  if (res.status === 404) {
    // fallback to js
    return fetchOrigin(path);
  } else {
    return toBinastContentType(res);
  }
}

function toBinastContentType(originalRes) {
  const res = new Response(originalRes.body, originalRes);
  res.headers.set("Content-Type", "application/javascript-binast");
  return res;
}

function toExtBinJs(path) {
  const parts = path.split(".");
  parts[parts.length - 1] = "binjs";
  return parts.join(".");
}

async function handleRequest(request) {
  let path = (new URL(request.url)).pathname;
  const supportBinJs = request.headers.get("Accept")
    .split(",").includes("application/javascript-binast");
  const lastSegment = path.substring(path.lastIndexOf('/'))
  const serveBinJs = lastSegment.endsWith(".js") && supportBinJs;

  if (lastSegment.indexOf('.') === -1) {
    path += '/index.html'
  }

  if (serveBinJs === true) {
    return fetchOriginJS(path);
  } else {
    return fetchOrigin(path);
  }
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});
