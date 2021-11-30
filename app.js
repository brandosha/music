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
      player.preload = "metadata"

      const queueObj = { song, player }
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

      if (playingNow) this.skip()
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
    skip() {
      if (this.player) {
        this.player.pause()
      }
      this.playNext()
    },
    playAtIndex(index) {
      const item = this.queue[index]

      if (this.player) {
        this.player.pause()
      }

      if (item) {
        item.player.currentTime = 0

        this.player = item.player
        item.player.play()
        
        this.queueIndex = index
        this.currentSong = item.song
      } else {
        this.player = null
        this.currentSong = null
        this.queueIndex = -1
        this.songProgress = 0
      }
    },
    shuffleQueue() {
      if (this.queue.length <= 1) return

      const i = this.queueIndex
      const queue = this.queue
      const current = queue[i]

      queue.splice(i, 1)
      shuffle(queue)
      queue.unshift(current)

      this.queueIndex = 0
    },
    removeFromQueue(i) {
      this.queue.splice(i, 1)
      if (i < this.queueIndex) {
        this.queueIndex -= 1
      }
    },
    clearQueue() {
      if (this.currentSong) {
        this.queue = [{
          song: this.currentSong,
          player: this.player
        }]

        this.queueIndex = 0
      } else {
        this.queue = []
        this.queueIndex = -1
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
      }
    },
    renamePlaylist() {
      const oldName = this.currentPage
      const name = this.playlistEditor.name.trim()

      if (db._playlistMap[name]) {
        alert(`A playlist with the name '${name}' already exists`)
      } else {
        const playlist = db._playlistMap[oldName]
        playlist.name = name
        playlist.songs.forEach(song => {
          song.playlists.delete(oldName)
          song.playlists.set(name, playlist)
        })

        db._playlistMap[name] = playlist
        db._playlistMap[oldName] = undefined

        Vue.set(this.nav, 0, "playlist~" + name)

        this.playlistEditor.name = null
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
      }
      
      if (!Array.isArray(song)) {
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

      if (Array.isArray(song)) {
        const songs = song

        songs.forEach(song => {
          if (artist) song.setArtist(artist)
          if (album) song.setAlbum(album)

          song.updateInStore()
        })
      } else {
        if (title) song.title = title
        if (artist) song.setArtist(artist)
        if (album) song.setAlbum(album)

        song.updateInStore()
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

      let search = this.search.trim().toLowerCase()
      if (search === "") {
        return songs
      } else {
        return songs.filter(song => {
          return (
            song.title.toLowerCase().includes(search) ||
            (song.artist !== "unknown" && song.artist.toLowerCase().includes(search)) ||
            (song.album !== "unknown" && song.album.toLowerCase().includes(search))
          )
        })
      }
    },
    artistsAlbums() {
      if (!this.nav[0].startsWith("artist~")) return

      const artist = this.currentPage
      return db._artistMap[artist].albums
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
    songs(songs) {
      if (!songs) return

      let outOfOrder = false
      for (let i = 1; i < songs.length; i++) {
        const a = songs[i - 1].title
        const b = songs[i].title

        if (a.localeCompare(b) === 1) {
          outOfOrder = true
          break
        }
      }
      if (outOfOrder) {
        songs.sort((a, b) => a.title.localeCompare(b.title))
      }
    },
    artists(artists) {
      if (!artists) return

      let outOfOrder = false
      for (let i = 1; i < artists.length; i++) {
        const a = artists[i - 1].name
        const b = artists[i].name

        if (a.localeCompare(b) === 1) {
          outOfOrder = true
          break
        }
      }
      if (outOfOrder) {
        artists.sort((a, b) => a.name.localeCompare(b.name))
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
    }
  }
})

Vue.component("nav-button", {
  props: ["page"],
  template: document.getElementById("nav-button").innerHTML,
  methods: {
    navigate() {
      app.nav.unshift(this.page)
    }
  }
})

Vue.component("song-row", {
  props: ["song", "i"],
  data() {
    const shared = ["nav", "options", "toggleOptions", "addToQueue", "playNow", "beginEditing", "playlist", "currentPage"]
    const data = {}
    shared.forEach(key => {
      data[key] = app[key]
    })

    return data
  },
  template: document.getElementById("song-row").innerHTML
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
  console.log(db.songs, db.artists, db.playlists)

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