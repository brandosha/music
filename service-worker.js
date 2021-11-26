const cacheName = 'music-v1'

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url)

  event.respondWith(
    caches.match(event.request).then(response => {
      if (url.origin !== location.origin) {
        if (response) {
          return response
        } else {
          return fetch(event.request).then(networkResponse => {
            caches.open(cacheName).then(cache => {
              cache.put(event.request, networkResponse.clone())
            })

            return networkResponse.clone()
          })
        }
      } else {
        return fetch(event.request).then(networkResponse => {
          caches.open(cacheName).then(cache => {
            cache.put(event.request, networkResponse.clone())
          })
  
          return networkResponse.clone()
        }).catch(error => {
          console.error(error)
  
          if (response) {
            return response
          } else {
            throw error
          }
        })
      }
    })
  )
})