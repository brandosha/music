const cacheName = 'network v1 @music'

self.addEventListener("fetch", event => {
  event.respondWith(
    respond(event.request)
  )
})

async function respond(req) {
  const url = new URL(req.url)

  let cachedResponse = await caches.match(req)
  if (url.pathname.startsWith("/file-uploads/") && cachedResponse) {
    const range = req.headers.get("Range")
    if (range) {
      const parts = range.split("=")
      const start = parseInt(parts[1].split("-")[0])
      const end = parseInt(parts[1].split("-")[1])

      const file = await cachedResponse.blob()
      const blob = file.slice(start, end + 1)
      return new Response(blob, {
        headers: {
          "Content-Range": `bytes ${start}-${end}/${file.size}`,
          "Content-Length": end - start + 1,
          "Content-Type": file.type
        },
        status: 206
      })
    }

    return cachedResponse
  } else if (url.hostname === 'localhost') {
    try {
      const networkResponse = await fetch(req)
      cache(req, networkResponse.clone())

      return networkResponse
    } catch (err) {
      if (cachedResponse) {
        return cachedResponse
      } else {
        throw err
      }
    }
  } else {
    const networkFetch = fetch(req).then(networkResponse => {
      cache(req, networkResponse.clone())

      return networkResponse
    })

    if (cachedResponse) {
      return cachedResponse
    } else {
      return networkFetch
    }
  }
}

async function cache(req, res) {
  const cache = await caches.open(cacheName)
  await cache.put(req, res)
}