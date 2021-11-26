{
  function idbPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  class Database {
    constructor() {
      this.ready = this.init()
    }

    async init() {
      const openRequest = indexedDB.open('music-db', 2)
      openRequest.onupgradeneeded = (event) => {
        const db = openRequest.result

        try {
          db.deleteObjectStore('files')
          db.deleteObjectStore('titles')
          db.deleteObjectStore('playlists')
        } catch (error) { }

        const fileStore = db.createObjectStore('files', { autoIncrement: true })

        const songStore = db.createObjectStore('songs', { keyPath: 'id' })
        songStore.createIndex('title', 'title', { unique: false })
        songStore.createIndex('artist', 'artist', { unique: false })
        songStore.createIndex('album', 'album', { unique: false })

        const playlistStore = db.createObjectStore('playlists', { autoIncrement: true })
        playlistStore.createIndex('name', 'name', { unique: false })
      }

      /** @type { IDBDatabase } */
      this.database = await idbPromise(openRequest)

      const transaction = this.database.transaction(['songs'], 'readonly')
      const songStore = transaction.objectStore('songs')

      this.songs = await idbPromise(songStore.getAll())
      this.songs = this.songs.map(obj => new Song(obj.id, obj.title))
    }

    async add(file) {
      const transaction = this.database.transaction(['files', 'songs'], 'readwrite')
      const fileStore = transaction.objectStore('files')
      const songStore = transaction.objectStore('songs')

      const key = await idbPromise(fileStore.put(file))

      const title = file.name.replace(/\.[^/.]+$/, '')
      await idbPromise(songStore.put({ id: key, title }))

      const song = new Song(key, title)
      song.file = file

      this.songs.push(song)
      return song
    }

    async remove(id) {
      const transaction = this.database.transaction(['files', 'songs'], 'readwrite')
      const fileStore = transaction.objectStore('files')
      const songStore = transaction.objectStore('songs')

      await idbPromise(fileStore.delete(id))
      await idbPromise(songStore.delete(id))

      for (let i = 0; i < this.songs.length; i++) {
        if (this.songs[i].id === id) {
          this.songs.splice(i, 1)
          break
        }
      }
    }

    async clear() {
      const transaction = this.database.transaction(['files', 'songs'], 'readwrite')
      const fileStore = transaction.objectStore('files')
      const songStore = transaction.objectStore('songs')

      await idbPromise(fileStore.clear())
      await idbPromise(songStore.clear())

      while (this.songs.length) {
        this.songs.pop()
      }
    }
  }

  /** @type { Database } */
  const db = window.db = new Database()

  const existingSongs = { }

  class Song {
    constructor(id, title) {
      if (existingSongs[id]) return existingSongs[id]

      this.id = id
      this.title = title

      existingSongs[id] = this
    }

    getFile() {
      if (this.file) return this.file
      if (this._filePromise) return this._filePromise

      const transaction = db.database.transaction(['files'], 'readonly')
      const fileStore = transaction.objectStore('files')

      this._filePromise = idbPromise(fileStore.get(this.id))
      this._filePromise.then(file => this.file = file)
      return this._filePromise
    }

    remove() {
      return db.remove(this.id)
    }
  }
}