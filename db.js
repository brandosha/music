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
      const openRequest = indexedDB.open('music-db', 1)
      openRequest.onupgradeneeded = (event) => {
        const db = openRequest.result

        const fileStore = db.createObjectStore('files', { autoIncrement: true })

        const titleStore = db.createObjectStore('titles', { keyPath: 'id' })

        const playlistStore = db.createObjectStore('playlists', { autoIncrement: true })
        playlistStore.createIndex('name', 'name', { unique: false })
      }

      /** @type { IDBDatabase } */
      this.database = await idbPromise(openRequest)

      const transaction = this.database.transaction(['titles'], 'readonly')
      const titleStore = transaction.objectStore('titles')

      this.titles = await idbPromise(titleStore.getAll())
      this.songs = this.titles.map(obj => new Song(obj.id, obj.title))
    }

    async add(file) {
      const transaction = this.database.transaction(['files', 'titles'], 'readwrite')
      const fileStore = transaction.objectStore('files')
      const titleStore = transaction.objectStore('titles')

      const key = await idbPromise(fileStore.put(file))

      const title = file.name.replace(/\.[^/.]+$/, '')
      await idbPromise(titleStore.put({ id: key, title }))

      const song = new Song(key, title)
      song.file = file

      this.songs.push(song)
      return song
    }

    async remove(id) {
      const transaction = this.database.transaction(['files', 'titles'], 'readwrite')
      const fileStore = transaction.objectStore('files')
      const titleStore = transaction.objectStore('titles')

      await idbPromise(fileStore.delete(id))
      await idbPromise(titleStore.delete(id))

      for (let i = 0; i < this.songs.length; i++) {
        if (this.songs[i].id === id) {
          this.songs.splice(i, 1)
          break
        }
      }
    }

    async clear() {
      const transaction = this.database.transaction(['files', 'titles'], 'readwrite')
      const fileStore = transaction.objectStore('files')
      const titleStore = transaction.objectStore('titles')

      await idbPromise(fileStore.clear())
      await idbPromise(titleStore.clear())

      while (this.songs.length) {
        this.songs.pop()
      }
    }
  }

  /** @type { Database } */
  const db = window.db = new Database()

  class Song {
    constructor(id, title) {
      this.id = id
      this.title = title
    }

    getFile() {
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