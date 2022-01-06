var app = new Vue({
  el: "#app",
  data: {
    view: "library",
    showNowPlaying: false,
    nav: ["~All Songs", "~Library"],
    navSearches: ["", ""],

    songs: [],
    artists: [],
    albums: [],
    playlists: [],
    
    queue: [],
    nextQueueItemKey: 0,
    queueIndex: 0,
    currentSong: null,
    songProgress: 0,
    paused: false,

    selectedSongs: [],

    // search: "",
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
    playlistExport: {
      showing: false,
      selected: []
    },

    infoView: {
      song: null
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
    addToQueue(song, next = false) {
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
          if (next) {
            if (this.willShuffle) {
              shuffle(songs)
            }

            songs = songs.reverse()
            if (!this.currentSong) {
              songs.unshift(songs.pop())
            }
          }

          alert.ignore = true
          for (const song of songs) {
            this.addToQueue(song, next)
          }
          alert.ignore = false

          return
        }
      }

      const player = new Audio(song.fileUrl())
      player.setAttribute("x-webkit-airplay", "allow")
      player.preload = "none"

      const queueObj = { song, player, key: this.nextQueueItemKey++ }
      if (next) {
        this.queue.splice(this.queueIndex + 1, 0, queueObj)
      } else if (this.willShuffle) {
        const index = Math.floor(Math.random() * (this.queue.length - this.queueIndex)) + this.queueIndex + 1
        this.queue.splice(index, 0, queueObj)
      } else {
        this.queue.push(queueObj)
      }

      if (!this.currentSong) {
        this.playNext()
      }

      player.onended = () => this.playNext()

      // Fetch and cache the album art
      song.artUrl()
    },
    playNow(song) {
      const alert = this.alert
      const playingNow = this.currentSong

      alert.ignore = true
      this.addToQueue(song, true)
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
        item.player.play().catch(err => { /* Ignore the NotAllowedError */ })
        
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

          const art = song.artUrl()
          if (art) {
            art.then(url => {
              if (url) metadata.artwork = [{ src: url }]
            })
          }

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

      let playlistsJson

      const promises = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.type.includes("audio")) {
          promises.push(db.add(files[i]))
        }

        if (file.name.endsWith("playlists.json")) {
          playlistsJson = file
        }
      }

      const songs = await Promise.all(promises)
      if (this.nav[0].startsWith("playlist~")) {
        songs.forEach(song => song.addToPlaylist(this.currentPage))
      }

      if (playlistsJson) {
        try {
          playlistsJson = await playlistsJson.text()
          db.importPlaylists(playlistsJson)
        } catch (err) {
          console.error(err)
        }
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

    async createPlaylist() {
      const name = prompt("Enter a name for the new playlist:")
      if (name) {
        await db.createPlaylist(name)
        this.nav = ["playlist~" + name, "~Library"]
        this.playlistExport.selected.push(name)
      }
    },
    addSelectedToPlaylist() {
      const playlist = this.playlist
      const { name } = playlist

      const song = playlist.adding

      if (!db._playlistMap[name]) this.playlistExport.selected.push(name)

      if (Array.isArray(playlist.adding)) {
        const songs = song
        songs.forEach(song => song.addToPlaylist(name))
      } else {
        song.addToPlaylist(name)
      }

      playlist.adding = null
      playlist.name = ""
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
        this.playlistExport.selected.push(name)
      }
    },
    reorderPlaylist() {
      db.savePlaylist(this.currentPage)
    },
    exportSelectedPlaylists() {
      const playlists = this.playlistExport.selected.map(name => db._playlistMap[name])

      const songs = { }
      const jsonPlaylists = []
      
      playlists.forEach(playlist => {
        if (!playlist || playlist.songs.length === 0) return

        jsonPlaylists.push({
          name: playlist.name,
          songs: playlist.songs.map(song => {
            const jsonSong = songs[song.id] = {
              title: song.title
            }
            if (song.artist !== "unknown") jsonSong.artist = song.artist
            if (song.album !== "unknown") jsonSong.album = song.album

            return song.id
          })
        })
      })

      if (jsonPlaylists.length > 0) {
        const json = {
          songs,
          playlists: jsonPlaylists
        }

        const jsonFile = new Blob([JSON.stringify(json)])
        const url = URL.createObjectURL(jsonFile)
  
        const link = document.getElementById("playlists-export-link")
        link.href = url
        link.click()
        this.playlistExport.showing = false

        setTimeout(() => {
          link.href = ""
          URL.revokeObjectURL(url)
        }, 10000)
      }
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

    formatTime(seconds) {
      if (isNaN(seconds)) {
        return "--:--"
      }

      seconds = Math.floor(seconds)

      const minutes = Math.floor(seconds / 60)
      const secondsLeft = seconds % 60
      return `${minutes}:${secondsLeft < 10 ? "0" : ""}${secondsLeft}`
    },

    navigateTo(page) {
      if (Array.isArray(page)) {
        this.navSearches = Array.from({ length: page.length + 1 }, () => "")
        this.nav = page.concat("~Library")
      } else {
        this.navSearches = ["", ""]
        this.nav = [page, "~Library"]
      }

      this.showNowPlaying = false
      this.infoView.song = null
    }
  },
  computed: {
    currentPlaylist() {
      if (this.nav[0].startsWith("playlist~")) {
        const name = this.currentPage
        return db._playlistMap[name]
      }
    },
    currentAlbum() {
      if (this.nav[0].startsWith("album~")) {
        return db._albumMap[this.currentPage]
      }
    },
    multiArtistAlbum() {
      const currentAlbum = this.currentAlbum
      if (!currentAlbum) return false

      const { songs } = currentAlbum
      for (let i = 1; i < songs.length; i++) {
        if (songs[i].artist !== songs[0].artist) return true
      }

      return false
    },

    search: {
      get() {
        return this.navSearches[0]
      },
      set(search) {
        Vue.set(this.navSearches, 0, search)
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
          songs = this.currentPlaylist.songs
        } else if (this.nav[0].startsWith("artist~")) {
          const name = this.currentPage
          songs = db._artistMap[name].songs
        } else if (this.nav[0].startsWith("album~")) {
          songs = this.currentAlbum.songs
        }
      } catch (err) {
        console.log(err)

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
      let albums = db.albums

      if (this.nav[0].startsWith("artist~")) {
        const artist = this.currentPage
        albums = db._artistMap[artist].albums
      }

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

    currentSongs() {
      if (this.selectedSongs.length > 0) {
        return this.selectedSongs
      } else {
        return this.filteredSongs
      }
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
    },
    // Another glorified watcher because why not :)
    storeQueue() {
      if (this.songs.length === 0) return

      const queueData = {
        index: this.queueIndex,
        queue: this.queue.map(item => item.song.id),
        loop: this.willLoop,
        willShuffle: this.willShuffle
      }
      localStorage.setItem("music-queue", JSON.stringify(queueData))
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
      // if (nav[0] !== "~All Songs") {
      //   app.search = ""
      // }

      app.options.song = null
      app.options.i = null

      localStorage.setItem("music-nav", JSON.stringify(nav))

      while (this.navSearches.length < nav.length) {
        if (nav[0] === "~All Songs") {
          this.navSearches.unshift(app.search)
        } else {
          this.navSearches.unshift('')
        }
      }
      while (this.navSearches.length > nav.length) {
        this.navSearches.shift()
      }
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
    },
    storeQueue() { /* Same as above */ }
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

const albumArt = { }
db.onready = () => {
  app.songs = db.songs
  app.artists = db.artists
  app.albums = db.albums
  app.playlists = db.playlists
  app.playlistExport.selected = db.playlists.map(p => p.name)

  app.nav = JSON.parse(localStorage.getItem("music-nav")) || app.nav

  const queueData = JSON.parse(localStorage.getItem("music-queue"))
  if (queueData) {
    const queue = []

    let index = -1
    queueData.queue.forEach(id => {
      const song = db.getSong(id)
      if (!song) {
        queueData.index -= 1
        return
      } else {
        index += 1
      }

      const player = new Audio(song.fileUrl())
      player.setAttribute("x-webkit-airplay", "allow")
      player.preload = "none"
      player.onended = () => app.playNext()

      if (index === queueData.index) {
        player.preload = "metadata"
        player.oncanplay = () => {
          app.$forceUpdate()
          
          player.preload = "none"
          player.oncanplay = undefined
        }
        player.onerror = () => {
          player.preload = "none"
        }
      }

      queue.push({ song, player, key: app.nextQueueItemKey++ })

      // Fetch and cache the album art
      song.artUrl()
    })

    app.queue = queue
    app.willLoop = queueData.loop
    app.willShuffle = queueData.willShuffle

    app.playAtIndex(queueData.index)
  }
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