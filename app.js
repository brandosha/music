var app = new Vue({
  el: "#app",
  data: {
    view: "library",
    showNowPlaying: false,
    nav: ["~All Songs", "~Library"],

    songs: [],
    artists: [],
    playlists: [],
    
    queue: [],
    nextQueueItemKey: 0,
    queueIndex: 0,
    currentSong: null,
    songProgress: 0,
    paused: false,

    search: "",
    willShuffle: false,
    willLoop: false,

    options: {
      song: null,
      i: null
    },

    playlistEditor: {
      name: null
    },
    playlist: {
      adding: null,
      name: ""
    },
    songEditor: {
      editing: null,
      title: "",
      artist: "",
      album: ""
    },
    alert: {
      show: false,
      song: null,
      duration: 2500,
      timeout: null,
      ignore: false,
      updateCounter: 0
    },

    player: null
  },
  methods: {
    async addToQueue(song, next = false) {
      this.options.song = null
      this.options.i = null

      const alert = this.alert
      if (!alert.ignore && this.currentSong) {
        alert.song = song
        alert.show = true
        alert.type = next ? "next" : "later"

        alert.updateCounter += 1
      }

      if (Array.isArray(song)) {
        let songs = song.slice()

        if (songs.length === 1) {
          song = songs[0]
        } else if (songs.length > 0) {
          if (this.willShuffle) {
            shuffle(songs)
          }
          if (next) {
            songs = songs.reverse()
            if (!this.currentSong) {
              songs.unshift(songs.pop())
            }
          }

          alert.ignore = true
          for (const song of songs) {
            await this.addToQueue(song, next)
          }
          alert.ignore = false

          return
        }
      }

      const player = new Audio(song.fileUrl())
      player.preload = "none"

      const queueObj = { song, player, key: this.nextQueueItemKey++ }
      if (next) {
        this.queue.splice(this.queueIndex + 1, 0, queueObj)
      } else {
        this.queue.push(queueObj)
      }

      if (!this.currentSong) {
        this.playNext()
      }

      player.onended = () => this.playNext()
    },
    async playNow(song) {
      const alert = this.alert
      const playingNow = this.currentSong

      alert.ignore = true
      await this.addToQueue(song, true)
      alert.ignore = false

      if (playingNow) this.playNext()
    },

    playNext() {
      let nextIndex = 0
      if (this.currentSong) {
        nextIndex = this.queueIndex + 1
      }
      if (this.willLoop && nextIndex >= this.queue.length) {
        nextIndex = 0
      }

      this.playAtIndex(nextIndex)
    },
    playPrevious() {
      let previousIndex = 0
      if (this.currentSong) {
        previousIndex = this.queueIndex - 1
      }
      if (this.willLoop && previousIndex < 0) {
        previousIndex = this.queue.length - 1
      }

      this.playAtIndex(previousIndex)
    },
    playAtIndex(index) {
      const item = this.queue[index]

      const prevPlayer = this.player
      if (prevPlayer) {
        // Reset previous player
        prevPlayer.pause()

        const src = prevPlayer.src
        prevPlayer.src = undefined
        prevPlayer.load()
        prevPlayer.src = src
      }

      if (item) {
        item.player.currentTime = 0

        this.player = item.player
        item.player.load()
        item.player.play()
        
        this.queueIndex = index
        this.currentSong = item.song

        if ("mediaSession" in navigator) {
          const { mediaSession } = navigator

          const { song } = item
          const metadata = new MediaMetadata({
            title: song.title
          })
          if (song.artist !== "unknown") metadata.artist = item.song.artist
          if (song.album !== "unknown") metadata.album = song.album

          mediaSession.metadata = metadata
        }
      } else {
        this.player = null
        this.currentSong = null
        this.queueIndex = -1
        this.songProgress = 0

        if ("mediaSession" in navigator) {
          const { mediaSession } = navigator

          mediaSession.metadata = new MediaMetadata({
            title: "Not Playing"
          })
        }
      }
    },
    shuffleQueue() {
      if (this.queue.length < 2) return

      const i = this.queueIndex
      const queue = this.queue
      const current = queue[i]

      if (current) {
        queue.splice(i, 1)
        shuffle(queue)
        queue.unshift(current)
        this.queueIndex = 0
      } else {
        shuffle(queue)
        this.queueIndex = -1

        Vue.set(this.queue, 0, queue[0]) // Vue.set is a hack to update the queue
      }
    },
    removeFromQueue(i) {
      this.queue.splice(i, 1)
      if (i < this.queueIndex) {
        this.queueIndex -= 1
      }
    },
    clearQueue() {
      this.queue = []
      this.queueIndex = -1
    },
    queueReordered(event) {
      const i = this.queueIndex
      const { from, to } = event

      if (from === i) {
        this.queueIndex = to
      } else if (to === i) {
        if (from > i) {
          this.queueIndex += 1
        } else {
          this.queueIndex -= 1
        }
      } else if (from < i && to > i) {
        this.queueIndex -= 1
      } else if (from > i && to < i) {
        this.queueIndex += 1
      }
    },

    seek() {
      const progress = this.songProgress
      if (this.player) {
        this.player.currentTime = progress * this.player.duration
      }
    },
    togglePlayback() {
      if (this.player) {
        if (this.player.paused) {
          this.player.play()
        } else {
          this.player.pause()
        }
      }
    },
    async upload(e) {
      const files = e.target.files

      const promises = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.type.includes("audio")) {
          promises.push(db.add(files[i]))
        }
      }

      if (this.nav[0].startsWith("playlist~")) {
        const songs = await Promise.all(promises)
        songs.forEach(song => song.addToPlaylist(this.currentPage))
      }
    },
    async remove(song, requestConfirmation = true) {
      if (Array.isArray(song)) {
        const songs = song

        if (songs.length === 1) {
          song = songs[0]
        } else if (songs.length > 0) {
          if (requestConfirmation && !confirm(`Are you sure you want to delete ${songs.length} songs?`)) {
            return
          }
  
          for (const song of songs) {
            await this.remove(song, false)
          }
  
          return
        }
      }

      if (requestConfirmation) {
        if (confirm(`Are you sure you want to delete '${song.title}'?`)) {
          song.remove()
        }
      } else {
        song.remove()
      }
    },

    createPlaylist() {
      const name = prompt("Enter a name for the new playlist:")
      if (name) {
        db.createPlaylist(name)
      }
    },
    addSelectedToPlaylist() {
      const song = this.playlist.adding
      if (Array.isArray(this.playlist.adding)) {
        const songs = song
        songs.forEach(song => song.addToPlaylist(this.playlist.name))
      } else {
        song.addToPlaylist(this.playlist.name)
      }

      this.playlist.adding = null
      this.playlist.name = ""
    },
    removePlaylist() {
      if (confirm(`Are you sure you want to delete the playlist '${this.currentPage}'?`)) {
        db.removePlaylist(this.currentPage)
        this.nav = ["~Library"]
        this.playlistEditor.name = null
      }
    },
    renamePlaylist() {
      const oldName = this.currentPage
      const name = this.playlistEditor.name.trim()

      if (db._playlistMap[name]) {
        alert(`A playlist with the name '${name}' already exists`)
      } else {
        db.renamePlaylist(oldName, name)

        Vue.set(this.nav, 0, "playlist~" + name)

        this.playlistEditor.name = null
      }
    },
    reorderPlaylist() {
      db.savePlaylist(this.currentPage)
    },

    toggleOptions(song, i) {
      const options = this.options

      if (options.song === song && options.i === i) {
        options.song = null
        options.i = null
      } else {
        options.song = song
        options.i = i
      }
    },

    beginEditing(song) {
      const editor = this.songEditor
      editor.editing = song

      if (Array.isArray(song)) {
        if (song.length === 1) {
          this.beginEditing(song[0])
          return
        }

        song = editor.editing = song.slice()
        const songs = song
        if (songs.length === 0) {
          editor.editing = null
          return
        }

        let album = songs[0].album
        let artist = songs[0].artist

        for (const song of songs) {
          if (album && song.album !== album) {
            album = ""
          }

          if (artist && song.artist !== artist) {
            artist = ""
          }

          if (!album && !artist) break
        }

        editor.album = album
        editor.artist = artist
      } else {
        editor.title = song.title
        editor.artist = song.artist
        editor.album = song.album
      }

      editor.defaults = Object.assign({}, editor)
      editor.defaults.editing = undefined
    },
    clearEditor() {
      this.songEditor = {
        editing: null,
        title: "",
        artist: "",
        album: ""
      }
    },
    editSelected() {
      const editor = this.songEditor
      const song = editor.editing

      const title = editor.title.trim()
      const artist = editor.artist.trim()
      const album = editor.album.trim()

      let editingAll = false
      const filteredLength = this.filteredSongs.length

      if (Array.isArray(song)) {
        const songs = song

        songs.forEach(song => {
          if (artist) song.setArtist(artist)
          if (album) song.setAlbum(album)

          song.updateInStore()
        })

        editingAll = songs.length === filteredLength
      } else {
        if (title) song.title = title
        if (artist) song.setArtist(artist)
        if (album) song.setAlbum(album)

        song.updateInStore()

        editingAll = filteredLength === 1
      }

      if (editingAll) {
        const nav = this.nav

        if (nav[0].startsWith("artist~")) {
          if (artist) Vue.set(nav, 0, "artist~" + artist)
        } else if (nav[0].startsWith("album~")) {
          if (album) Vue.set(nav, 0, "album~" + album)
          if (artist) Vue.set(nav, 1, "artist~" + artist)
        }
      }

      this.clearEditor()
    },
    formatTime(seconds) {
      if (isNaN(seconds)) {
        return "--:--"
      }

      seconds = Math.floor(seconds)

      const minutes = Math.floor(seconds / 60)
      const secondsLeft = seconds % 60
      return `${minutes}:${secondsLeft < 10 ? "0" : ""}${secondsLeft}`
    }
  },
  computed: {
    currentPlaylist() {
      if (this.nav[0].startsWith("playlist~")) {
        const name = this.currentPage
        return db._playlistMap[name]
      }
    },

    searchTerms() {
      const search = this.search.trim().toLowerCase()
      if (search === "") {
        return null
      } else {
        const advancedSearchRegex = /(\s|^)(-)?(artist|album|playlist)?:?(".*?"|[^\s]*)/g
        const matches = search.matchAll(advancedSearchRegex)

        const searchTerms = { }
        for (let [match, _, negative, param, value] of matches) {
          if (value.startsWith('"')) { value = value.slice(1) }
          if (value.endsWith('"')) { value = value.slice(0, -1) }

          value = value.trim()
          if (!value) continue

          if (!param) param = "title"

          let terms = searchTerms[param]
          if (!terms) terms = searchTerms[param] = []

          terms.push({ negative : !!negative, str: value })
        }

        return searchTerms
      }
    },
    filteredSongs() {
      let songs = this.songs

      try {
        if (this.nav[0].startsWith("playlist~")) {
          const name = this.currentPage
          songs = db._playlistMap[name].songs
        } else if (this.nav[0].startsWith("artist~")) {
          const name = this.currentPage
          songs = db._artistMap[name].songs
        } else if (this.nav[0].startsWith("album~")) {
          const artist = this.previousPage
          const album = this.currentPage
  
          songs = db._artistMap[artist].albumMap[album].songs
        }
      } catch (err) {
        if (this.nav.length > 1) {
          this.nav.shift()
        } else {
          this.nav = ["~Library"]
        }
        
        return this.filteredSongs
      }

      const searchTerms = this.searchTerms
      if (!searchTerms) {
        return songs
      } else {
        return songs.filter(song => {
          for (const param in searchTerms) {
            if (param === "playlist") {
              const playlists = song.playlists

              for (const term of searchTerms[param]) {

                let some = false
                for (let [playlist] of playlists) {
                  if (playlist.toLowerCase().includes(term.str)) {
                    some = true
                    break
                  }
                }

                if (some === term.negative) return false
              }
            } else {
              const value = song[param].toLowerCase()

              for (const term of searchTerms[param]) {
                const incl = value.includes(term.str)
                if (incl === term.negative) {
                  return false
                }
              }
            }
          }

          return true
        })
      }
    },
    filteredArtists() {
      const searchTerms = this.searchTerms
      if (!searchTerms) return this.artists

      if (Object.keys(searchTerms).some(param => param !== "title" && param !== "artist")) return []
      const terms = []
      if (searchTerms.title) terms.push(...searchTerms.title)
      if (searchTerms.artist) terms.push(...searchTerms.artist)

      return this.artists.filter(artist => {
        for (const term of terms) {
          const incl = artist.name.toLowerCase().includes(term.str)
          if (term.negative === incl) return false
        }

        return true
      })
    },
    filteredAlbums() {
      if (!this.nav[0].startsWith("artist~")) return
      const artist = this.currentPage
      const albums = db._artistMap[artist].albums

      const searchTerms = this.searchTerms
      if (!searchTerms) return albums

      if (Object.keys(searchTerms).some(param => param !== "title" && param !== "album")) return []
      const terms = []
      if (searchTerms.title) terms.push(...searchTerms.title)
      if (searchTerms.album) terms.push(...searchTerms.album)

      return albums.filter(album => {
        for (const term of terms) {
          const incl = album.name.toLowerCase().includes(term.str)
          if (term.negative === incl) return false
        }

        return true
      })
    },
    filteredPlaylists() {
      const searchTerms = this.searchTerms
      if (!searchTerms) return this.playlists

      if (Object.keys(searchTerms).some(param => param !== "title" && param !== "playlist")) return []
      const terms = []
      if (searchTerms.title) terms.push(...searchTerms.title)
      if (searchTerms.playlist) terms.push(...searchTerms.playlist)

      return this.playlists.filter(playlist => {
        for (const term of terms) {
          const incl = playlist.name.toLowerCase().includes(term.str)
          if (term.negative === incl) return false
        }

        return true
      })
    },

    currentPage() {
      const page = this.nav[0]
      if (page) {
        return page.split("~").slice(1).join("~")
      }
    },
    previousPage() {
      const page = this.nav[1]
      if (page) {
        return page.split("~").slice(1).join("~")
      }
    },

    // This is basically a glorified watcher
    setMediaSessionActions() {
      if (!("mediaSession" in navigator)) return false
    
      const { mediaSession } = navigator
    
      if (this.queueIndex < 0 || this.queueIndex > this.queue.length - 1 || !this.player) {
        mediaSession.setActionHandler('play', () => this.playAtIndex(0))
      } else {
        mediaSession.setActionHandler('play', () => {
          this.player.play()
        })
      }
    
      if (this.player) {
        mediaSession.setActionHandler('seekto', e => {
          this.player.currentTime = e.seekTime
        })
        mediaSession.setActionHandler('pause', () => {
          this.player.pause()
        })
      } else {
        mediaSession.setActionHandler('seekto', null)
        mediaSession.setActionHandler('pause', null)
      }
      
    
      if (this.queueIndex > 0 || this.willLoop) {
        mediaSession.setActionHandler('previoustrack', this.playPrevious)
      } else {
        mediaSession.setActionHandler('previoustrack', null)
      }
    
      if (this.queueIndex < this.queue.length - 1 || this.willLoop) {
        mediaSession.setActionHandler('nexttrack', this.playNext)
      } else {
        mediaSession.setActionHandler('nexttrack', null)
      }
      
      return true
    }
  },
  watch: {
    currentSong() {
      if (this.currentSong) {
        document.title = this.currentSong.title
      } else {
        document.title = "Not Playing"
      }
    },
    nav(nav) {
      app.search = ""

      app.options.song = null
      app.options.i = null

      localStorage.setItem("music-nav", JSON.stringify(nav))
    },

    search() {
      this.options.song = null
      this.options.i = null
    },

    "alert.updateCounter": function() {
      const alert = this.alert

      if (!alert.show) return

      if (alert.timeout !== null) {
        clearTimeout(alert.timeout)
      }

      alert.timeout = setTimeout(() => {
        alert.show = false
        alert.timeout = null
      }, alert.duration)
    },

    "playlistEditor.playlist": function(name) {
      this.playlistEditor.name = name
    },
    
    setMediaSessionActions() {
      // This watcher ensures that the computed property will actually be updated
    }
  }
})

setInterval(() => {
  if (app.player && app.player.paused !== app.paused) {
    app.paused = app.player.paused
  }

  if (app.player && !app.player.paused) {
    if (app.player.duration === 0 || isNaN(app.player.duration)) {
      app.songProgress = 0
    } else {
      app.songProgress = app.player.currentTime / app.player.duration
    }
  }
}, 15)

db.onready = () => {
  app.songs = db.songs
  app.artists = db.artists
  const playlists = app.playlists = db.playlists

  app.nav = JSON.parse(localStorage.getItem("music-nav")) || app.nav
}

// https://stackoverflow.com/a/2450976
function shuffle(array) {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}

navigator.serviceWorker.register("service-worker.js")