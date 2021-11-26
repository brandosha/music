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
      const openRequest = indexedDB.open('music-db', 3)
      openRequest.onupgradeneeded = (event) => {
        const db = openRequest.result

        try {
          db.deleteObjectStore('files')
          db.deleteObjectStore('songs')
          db.deleteObjectStore('playlists')

          db.deleteObjectStore('titles')
        } catch (error) { }

        const fileStore = db.createObjectStore('files', { autoIncrement: true })

        const songStore = db.createObjectStore('songs', { keyPath: 'id' })
        songStore.createIndex('title', 'title', { unique: false })
        songStore.createIndex('artist', 'artist', { unique: false })
        songStore.createIndex('album', 'album', { unique: false })

        const playlistStore = db.createObjectStore('playlists', { keyPath: 'name' })
      }

      /** @type { IDBDatabase } */
      this.database = await idbPromise(openRequest)

      const transaction = this.database.transaction(['songs', 'playlists'], 'readonly')
      const songStore = transaction.objectStore('songs')

      const songs = await idbPromise(songStore.getAll())

      const songMap = {}
      this.songs = songs.map(obj => {
        const song = new Song(obj.id, obj.title)
        songMap[obj.id] = song
        return song
      })
      this._songMap = songMap

      const playlistStore = transaction.objectStore('playlists')
      const playlists = await idbPromise(playlistStore.getAll())

      const playlistMap = {}
      this.playlists = playlists.map(playlist => {
        const list = { name: playlist.name, songs: [] }

        playlist.songs.forEach(id => {
          const song = songMap[id]

          if (song) {
            list.songs.push(song)
            song.playlists.push(list)
          }
        })

        playlistMap[playlist.name] = list

        return list
      })
      this._playlistMap = playlistMap
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

    async removeSong(id) {
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

    async removePlaylist(name) {
      const transaction = this.database.transaction(['playlists'], 'readwrite')
      const playlistStore = transaction.objectStore('playlists')

      await idbPromise(playlistStore.delete(name))

      const list = this._playlistMap[name]
      this.playlists.splice(this.playlists.indexOf(list), 1)
      this._playlistMap[name] = undefined
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
      if (!id || !title) return null

      this.id = id
      this.title = title
      this.playlists = []

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

    async remove() {
      await Promise.all(
        this.playlists.map(playlist => this.removeFromPlaylist(playlist.name))
      )

      await db.removeSong(this.id)
    }

    async addToPlaylist(name) {
      const { database } = db

      const transaction = database.transaction(['playlists'], 'readwrite')
      const playlistStore = transaction.objectStore('playlists')

      const playlist = await idbPromise(playlistStore.get(name))
      if (playlist) {
        playlist.songs.push(this.id)
        await idbPromise(playlistStore.put(playlist))

        db._playlistMap[name].songs.push(this)
      } else {
        await idbPromise(playlistStore.put({ name, songs: [this.id] }))

        const newList = { name, songs: [this] }
        db.playlists.push(newList)
        db._playlistMap[name] = newList
      }
    }

    async removeFromPlaylist(name) {
      const { database } = db

      const transaction = database.transaction(['playlists'], 'readwrite')
      const playlistStore = transaction.objectStore('playlists')

      const playlist = await idbPromise(playlistStore.get(name))
      if (playlist) {
        const index = playlist.songs.indexOf(this.id)
        if (index !== -1) {
          playlist.songs.splice(index, 1)
          await idbPromise(playlistStore.put(playlist))

          const list = db._playlistMap[name]
          list.songs.splice(index, 1)
        }
      }
    }
  }
}