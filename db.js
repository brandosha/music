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

      const artistMap = { }
      const artists = this.artists = []
      
      const songMap = { }
      this.songs = songs.map(obj => {
        const song = new Song(obj.id, obj)
        songMap[obj.id] = song

        let artist = artistMap[song.artist]
        if (!artist) {
          artist = {
            name: song.artist,
            albumMap: { },
            albums: [],
            songs: []
          }

          artists.push(artist)
          artistMap[artist.name] = artist
        }

        artist.songs.push(song)

        let album = artist.albumMap[song.album]
        if (!album) {
          album = {
            name: song.album,
            songs: [],
            artist
          }

          artist.albums.push(album)
          artist.albumMap[album.name] = album
        }

        album.songs.push(song)

        return song
      })
      this._songMap = songMap
      this._artistMap = artistMap

      const playlistStore = transaction.objectStore('playlists')
      const playlists = await idbPromise(playlistStore.getAll())

      const playlistMap = { }
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

      const key = await idbPromise(fileStore.put(file))

      const title = file.name.replace(/\.[^/.]+$/, '')
      const song = new Song(key, { title })
      song.file = file
      await song.updateInStore()

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

      this.songs.splice(0, this.songs.length)
    }
  }

  /** @type { Database } */
  const db = window.db = new Database()

  const existingSongs = { }

  class Song {
    constructor(id, data) {
      if (existingSongs[id]) return existingSongs[id]
      if (!id || !data) return null

      this.id = id

      this.title = data.title || "unknown"
      this.artist = data.artist || "unknown"
      this.album = data.album || "unknown"

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

    async setArtist(name) {
      if (name == this.artist) return
      console.log(this, "setArtist", name)

      let previousArtist = db._artistMap[this.artist]
      previousArtist.songs.splice(previousArtist.songs.indexOf(this), 1)

      let previousAlbum = previousArtist.albumMap[this.album]
      previousAlbum.songs.splice(previousAlbum.songs.indexOf(this), 1)

      if (previousAlbum.songs.length === 0) {
        previousArtist.albums.splice(previousArtist.albums.indexOf(previousAlbum), 1)
        previousArtist.albumMap[this.album] = undefined
      }
      if (previousArtist.songs.length === 0) {
        db.artists.splice(db.artists.indexOf(previousArtist), 1)
        db._artistMap[this.artist] = undefined
      }

      let artist = db._artistMap[name]
      if (!artist) {
        artist = {
          name,
          albumMap: { },
          albums: [],
          songs: []
        }

        db.artists.push(artist)
        db._artistMap[artist.name] = artist
      }
      artist.songs.push(this)

      let album = artist.albumMap[this.album]
      if (!album) {
        album = {
          name: this.album,
          songs: [],
          artist
        }

        artist.albums.push(album)
        artist.albumMap[album.name] = album
      }
      album.songs.push(this)

      this.artist = name
    }

    async setAlbum(name) {
      if (name == this.album) return
      console.log(this, "setAlbum", name)

      const artist = db._artistMap[this.artist]

      let previousAlbum = artist.albumMap[this.album]
      previousAlbum.songs.splice(previousAlbum.songs.indexOf(this), 1)

      if (previousAlbum.songs.length === 0) {
        artist.albums.splice(artist.albums.indexOf(previousAlbum), 1)
        artist.albumMap[this.album] = undefined
      }
      
      let album = artist.albumMap[name]
      if (!album) {
        album = {
          name,
          songs: [],
          artist
        }

        artist.albums.push(album)
        artist.albumMap[album.name] = album
      }
      album.songs.push(this)

      this.album = name
    }

    async updateInStore() {
      const { database } = db

      const { id, title, artist, album } = this
      const songData = { id, title, artist, album }

      const transaction = database.transaction(['songs'], 'readwrite')
      const songStore = transaction.objectStore('songs')

      await idbPromise(songStore.put(songData))
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