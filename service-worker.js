const cacheName = 'music-v1'

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return fetch(event.request).then(networkResponse => {
        if (networkResponse.ok) {
          caches.open(cacheName).then(cache => {
            cache.put(event.request, networkResponse.clone())
          })

          return networkResponse.clone()
        } else if (response) {
          return response
        } else {
          return networkResponse
        }
      })
    })
  )
})