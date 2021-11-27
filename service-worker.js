const cacheName = 'music-v1'

self.addEventListener("fetch", event => {
  event.respondWith(
    respond(event.request)
  )
})

async function respond(req) {
  const url = new URL(req.url)

  let cachedResponse = await caches.match(req)
  if (url.hostname === 'localhost') {
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