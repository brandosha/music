const networkCacheName = 'network v1 @music'
const fileCacheName = 'files v1 @music'

self.addEventListener('install', async event => {
  const keys = await caches.keys()

  keys.forEach(key => {
    if (key !== networkCacheName && key !== fileCacheName) {
      caches.delete(key)
    }
  })
})

self.addEventListener("fetch", event => {
  event.respondWith(
    respond(event.request)
  )
})

const swPath = location.pathname.replace(/\/service-worker\.js$/, "")

async function respond(req) {
  const url = new URL(req.url)

  if (url.pathname.startsWith(swPath + '/file-uploads/')) {
    const cache = await caches.open(fileCacheName)
    const cachedFile = await cache.match(req)

    if (cachedFile) {
      const range = req.headers.get("Range")
      if (range) {
        const parts = range.split("=")
        const start = parseInt(parts[1].split("-")[0])
        const end = parseInt(parts[1].split("-")[1])

        const file = await cachedFile.blob()
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

      return cachedFile
    } else {
      return new Response(null, { status: 404 })
    }
  } else {
    const cache = await caches.open(networkCacheName)
    const cachedResponse = await cache.match(req)
    
    if (url.hostname === 'localhost') {
      try {
        const networkResponse = await fetch(req)
        cacheRequest(req, networkResponse.clone())
  
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
        cacheRequest(req, networkResponse.clone())
  
        return networkResponse
      })
  
      if (cachedResponse) {
        return cachedResponse
      } else {
        return networkFetch
      }
    }
  }
}

async function cacheRequest(req, res) {
  if (!res.ok) return

  const cache = await caches.open(networkCacheName)
  await cache.put(req, res)
}