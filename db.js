{
  function idbPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  class Database {
    constructor() {
      this.init()
    }

    /** @param { () => void } value */
    set onready(value) {
      /** @type { () => void } */
      this._onready = value

      if (this._playlistMap) {
        this._onready()
      }
    }

    async init() {
      const openRequest = indexedDB.open('music-db', 4)
      openRequest.onupgradeneeded = (event) => {
        if (this.database) {
          this.database.close()
          setTimeout(() => {
            this.init()
          }, 100)
        }

        const db = openRequest.result

        const deleteStore = (name) => {
          try {
            db.deleteObjectStore(name)
          } catch (error) {
            // Ignore
          }
        }

        deleteStore('files')
        deleteStore('songs')
        deleteStore('playlists')
        deleteStore('titles')

        const songStore = db.createObjectStore('songs', { keyPath: 'id' })
        songStore.createIndex('title', 'title', { unique: false })
        songStore.createIndex('artist', 'artist', { unique: false })
        songStore.createIndex('album', 'album', { unique: false })

        const playlistStore = db.createObjectStore('playlists', { keyPath: 'name' })
      }

      try {
        /** @type { IDBDatabase } */
        this.database = await idbPromise(openRequest)
      } catch (err) {
        await idbPromise(indexedDB.deleteDatabase())
        this.init()
        return
      }
      

      const transaction = this.database.transaction(['songs', 'playlists'], 'readonly')
      const songStore = transaction.objectStore('songs')

      const songs = []
      await new Promise(resolve => {
        const cursorReq = songStore.index('title').openCursor()
        cursorReq.onsuccess = e => {
          const cursor = e.target.result
          if (cursor) {
            songs.push(cursor.value)
            cursor.continue()
          } else {
            resolve()
          }
        }
      })

      const artistMap = { }
      const artists = this.artists = []
      
      this.lastKey = 0
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

          insertSorted(artists, artist, (a, b) => a.name.localeCompare(b.name))
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

          insertSorted(artist.albums, album, (a, b) => a.name.localeCompare(b.name))
          artist.albumMap[album.name] = album
        }

        album.songs.push(song)
        if (song.id > this.lastKey) {
          this.lastKey = song.id
        }

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
            song.playlists.set(list.name, list)
          }
        })

        playlistMap[playlist.name] = list

        return list
      })
      this._playlistMap = playlistMap

      if (this._onready) {
        this._onready()
      }
    }

    async add(file) {
      const key = this.lastKey = this.lastKey + 1

      const metadata = (await MusicMetadata.parseBlob(file)).common
      if (!metadata.title) {
        metadata.title = file.name.replace(/\.[^/.]+$/, '')
      }

      const song = new Song(key, metadata)
      song.file = file
      await song.updateInStore()

      const cache = await caches.open("files v1 @music")
      const req = new Request(`file-uploads/${key}`)
      const res = new Response(file, { headers: { 'Content-Type': file.type } })
      cache.put(req, res)

      insertSorted(this.songs, song, (a, b) => a.title.localeCompare(b.title))
      return song
    }

    async removeSong(id) {
      const transaction = this.database.transaction(['songs'], 'readwrite')
      const songStore = transaction.objectStore('songs')

      await idbPromise(songStore.delete(id))

      const cache = await caches.open("files v1 @music")
      const req = new Request(`file-uploads/${id}`)
      cache.delete(req)

      for (let i = 0; i < this.songs.length; i++) {
        if (this.songs[i].id === id) {
          this.songs.splice(i, 1)
          break
        }
      }
    }

    async createPlaylist(name, songs = []) {
      const transaction = this.database.transaction(['playlists'], 'readwrite')
      const playlistStore = transaction.objectStore('playlists')

      const list = { name, songs }
      await idbPromise(playlistStore.add(list))

      insertSorted(this.playlists, list, (a, b) => a.name.localeCompare(b.name))
      this._playlistMap[name] = list

      return list
    }
    async removePlaylist(name) {
      const transaction = this.database.transaction(['playlists'], 'readwrite')
      const playlistStore = transaction.objectStore('playlists')

      await idbPromise(playlistStore.delete(name))

      const list = this._playlistMap[name]
      this.playlists.splice(this.playlists.indexOf(list), 1)
      this._playlistMap[name] = undefined
    }
    async renamePlaylist(oldName, newName) {
      const playlist = db._playlistMap[oldName]
      if (!playlist) return

      playlist.name = newName
      playlist.songs.forEach(song => {
        song.playlists.delete(oldName)
        song.playlists.set(newName, playlist)
      })

      this._playlistMap[newName] = playlist
      this._playlistMap[oldName] = undefined

      const transaction = this.database.transaction(['playlists'], 'readwrite')
      const playlistStore = transaction.objectStore('playlists')

      await idbPromise(playlistStore.delete(oldName))
      await idbPromise(
        playlistStore.put({
          name: newName,
          songs: playlist.songs.map(song => song.id)
        })
      )
    }
    async savePlaylist(name) {
      const playlist = db._playlistMap[name]
      if (!playlist) return

      const transaction = this.database.transaction(['playlists'], 'readwrite')
      const playlistStore = transaction.objectStore('playlists')

      await idbPromise(
        playlistStore.put({
          name: playlist.name,
          songs: playlist.songs.map(song => song.id)
        })
      )
    }

    async clear() {
      const transaction = this.database.transaction(['songs', 'playlists'], 'readwrite')
      const songStore = transaction.objectStore('songs')
      const playlistStore = transaction.objectStore('playlists')

      await idbPromise(songStore.clear())
      await idbPromise(playlistStore.clear())

      const cache = await caches.open("files v1 @music")
      cache.delete()

      this.songs.splice(0, this.songs.length)
    }

    getSong(id) {
      return new Song(id)
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
      this.playlists = new Map()

      this.title = data.title || "unknown"
      this.artist = data.artist || "unknown"
      this.album = data.album || "unknown"

      if (db._artistMap) {
        this.setArtist(data.artist || "unknown", true)
        this.setAlbum(data.album || "unknown", true)
      }

      existingSongs[id] = this
    }

    fileUrl() {
      return "file-uploads/" + this.id
    }

    async setArtist(name, force = false) {
      if (!force && name == this.artist) return

      try {
        let previousArtist = db._artistMap[this.artist]
        const artistSongIndex = previousArtist.songs.indexOf(this)
        if (artistSongIndex > -1) {
          previousArtist.songs.splice(artistSongIndex, 1)
        }

        let previousAlbum = previousArtist.albumMap[this.album]
        const albumSongIndex = previousAlbum.songs.indexOf(this)
        if (albumSongIndex > -1) {
          previousAlbum.songs.splice(albumSongIndex, 1)
        }

        if (previousAlbum.songs.length === 0) {
          previousArtist.albums.splice(previousArtist.albums.indexOf(previousAlbum), 1)
          previousArtist.albumMap[this.album] = undefined
        }
        if (previousArtist.songs.length === 0) {
          db.artists.splice(db.artists.indexOf(previousArtist), 1)
          db._artistMap[this.artist] = undefined
        }
      } catch (err) { }

      let artist = db._artistMap[name]
      if (!artist) {
        artist = {
          name,
          albumMap: { },
          albums: [],
          songs: []
        }

        insertSorted(db.artists, artist, (a, b) => a.name.localeCompare(b.name))
        db._artistMap[artist.name] = artist
      }
      insertSorted(artist.songs, this, (a, b) => a.title.localeCompare(b.title))

      let album = artist.albumMap[this.album]
      if (!album) {
        album = {
          name: this.album,
          songs: [],
          artist
        }

        insertSorted(artist.albums, album, (a, b) => a.name.localeCompare(b.name))
        artist.albumMap[album.name] = album
      }
      insertSorted(album.songs, this, (a, b) => a.title.localeCompare(b.title))

      this.artist = name
    }

    async setAlbum(name, force = false) {
      if (!force && name == this.album) return

      const artist = db._artistMap[this.artist]

      try {
        let previousAlbum = artist.albumMap[this.album]
        const index = previousAlbum.songs.indexOf(this)
        if (index > -1) {
          previousAlbum.songs.splice(index, 1)
        }

        if (previousAlbum.songs.length === 0) {
          artist.albums.splice(artist.albums.indexOf(previousAlbum), 1)
          artist.albumMap[this.album] = undefined
        }
      } catch (err) { }
      
      
      let album = artist.albumMap[name]
      if (!album) {
        album = {
          name,
          songs: [],
          artist
        }

        insertSorted(artist.albums, album, (a, b) => a.name.localeCompare(b.name))
        artist.albumMap[album.name] = album
      }
      insertSorted(album.songs, this, (a, b) => a.title.localeCompare(b.title))

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
      const promises = []
      this.playlists.forEach((playlist) => {
        promises.push(
          this.removeFromPlaylist(playlist.name)
        )
      })
      await Promise.all(promises)

      try {
        let previousArtist = db._artistMap[this.artist]
        const artistSongIndex = previousArtist.songs.indexOf(this)
        if (artistSongIndex > -1) {
          previousArtist.songs.splice(artistSongIndex, 1)
        }

        let previousAlbum = previousArtist.albumMap[this.album]
        const albumSongIndex = previousAlbum.songs.indexOf(this)
        if (albumSongIndex > -1) {
          previousAlbum.songs.splice(albumSongIndex, 1)
        }

        if (previousAlbum.songs.length === 0) {
          previousArtist.albums.splice(previousArtist.albums.indexOf(previousAlbum), 1)
          previousArtist.albumMap[this.album] = undefined
        }
        if (previousArtist.songs.length === 0) {
          db.artists.splice(db.artists.indexOf(previousArtist), 1)
          db._artistMap[this.artist] = undefined
        }
      } catch (err) { }

      await db.removeSong(this.id)
    }

    async addToPlaylist(name) {
      if (this.playlists.has(name)) return

      const { database } = db

      const transaction = database.transaction(['playlists'], 'readwrite')
      const playlistStore = transaction.objectStore('playlists')

      const playlist = await idbPromise(playlistStore.get(name))
      if (playlist) {
        playlist.songs.unshift(this.id)
        await idbPromise(playlistStore.put(playlist))

        db._playlistMap[name].songs.unshift(this)
      } else {
        await idbPromise(playlistStore.put({ name, songs: [this.id] }))

        const newList = { name, songs: [this] }
        insertSorted(db.playlists, newList, (a, b) => a.name.localeCompare(b.name))
        db._playlistMap[name] = newList
      }

      this.playlists.set(name, db._playlistMap[name])
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

      this.playlists.delete(name)
    }
  }

  function insertSorted(arr, value, compare) {
    if (arr.length === 0) {
      arr.push(value)
      return
    } else if (arr.length === 1) {
      const comparison = compare(value, arr[0])
      if (comparison < 0) {
        arr.unshift(value)
      } else {
        arr.push(value)
      }

      return
    }

    let lower = 0
    let upper = arr.length - 1
    let i
    while (upper >= lower) {
      i = Math.floor((lower + upper) / 2)
      const val = arr[i]

      const comparison = compare(val, value)

      if (comparison < 0) {
        i += 1
        lower = i
      } else if (comparison > 0) {
        upper = i - 1
      } else {
        arr.splice(i, 0, value)
        
        return
      }
    }

    arr.splice(i, 0, value)
  }
}