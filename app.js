var app = new Vue({
  el: "#app",
  data: {
    view: "library",
    nav: ["~All Songs", "~Library"],

    songs: [],
    artists: [],
    playlists: [],
    
    queue: [],
    currentSong: null,
    songProgress: 0,
    paused: false,

    search: "",
    willShuffle: false,
    willLoop: false,

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

    player: null
  },
  methods: {
    async addToQueue(song, front = false) {
      if (Array.isArray(song)) {
        let songs = song.slice()

        if (songs.length === 1) {
          song = songs[0]
        } else if (songs.length > 0) {
          if (this.willShuffle) {
            shuffle(songs)
          }
          if (front) {
            songs = songs.reverse()
            if (!this.currentSong) {
              songs.unshift(songs.pop())
            }
          }

          for (const song of songs) {
            await this.addToQueue(song, front)
          }

          return
        }
      }

      const player = new Audio(song.fileUrl())
      player.preload = "metadata"

      const queueObj = { song, player }
      if (front) {
        this.queue.unshift(queueObj)
      } else {
        this.queue.push(queueObj)
      }

      if (!this.currentSong) {
        this.playNext()
      }

      player.onended = () => this.playNext()
    },
    playNext() {
      const next = this.queue.shift()

      if (next) {
        this.player = next.player
        next.player.play()
        
        this.currentSong = next.song
        if (this.willLoop) {
          this.queue.push(next)
        }
      } else {
        this.player = null
        this.currentSong = null
        this.songProgress = 0
      }
    },
    skip() {
      if (this.player) {
        this.player.pause()
      }
      this.playNext()
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
        promises.push(db.add(files[i]))
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
    },
    shuffle
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
        } else if (this.nav[0].startsWith("album")) {
          const artist = this.nav[0].split("@")[1].split("~")[0]
          const album = this.currentPage
  
          songs = db._artistMap[artist].albumMap[album].songs
        }
      } catch (err) {
        this.nav.shift()
        return this.filteredSongs
      }

      let search = this.search.trim().toLowerCase()
      if (search === "") {
        return songs
      } else {
        return songs.filter(song => {
          return song.title.toLowerCase().includes(search)
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
    songs() {
      const songs = this.songs

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
    willLoop() {
      const lastSong = this.queue[this.queue.length - 1]
      if (this.willLoop && this.currentSong && (!lastSong || lastSong.song !== this.currentSong)) {
        this.addToQueue(this.currentSong)
      } else if (!this.willLoop && lastSong && lastSong.song === this.currentSong) {
        this.queue.pop()
      }
    },
    nav(nav) {
      app.search = ""
      localStorage.setItem("music-nav", JSON.stringify(nav))
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

db.ready.then(() => {
  app.songs = db.songs
  app.artists = db.artists
  const playlists = app.playlists = db.playlists

  app.nav = JSON.parse(localStorage.getItem("music-nav")) || app.nav
})

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