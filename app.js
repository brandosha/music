var app = new Vue({
  el: "#app",
  data: {
    view: "library",
    songs: [],
    queue: [],
    
    currentSong: null,
    songProgress: 0,

    filter: "",

    player: null
  },
  methods: {
    async addToQueue(song, front = false) {
      const player = new Audio()

      const queueObj = { song, player }
      if (front) {
        this.queue.unshift(queueObj)
      } else {
        this.queue.unshift(queueObj)
      }

      if (!this.currentSong) {
        player.play()
      }

      const file = await song.getFile()
      try {
        player.src = srcUrl(file)
      } catch (err) {
        console.log(err)
      }

      if (!this.currentSong) {
        this.playNext()
      }

      player.onended = () => this.playNext()
    },
    playNext() {
      const next = this.queue.shift()
      console.log(next)

      if (next) {
        this.player = next.player
        next.player.play()

        this.currentSong = next.song
      } else {
        this.player = null
        this.currentSong = null
        this.songProgress = 0
      }
    },
    skip() {
      if (this.player) {
        this.player.currentTime = this.player.duration - 0.1
        this.player.play()
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
    upload(e) {
      const files = e.target.files
      for (let i = 0; i < files.length; i++) {
        db.add(files[i])
      }
    }
  },
  computed: {
    fullQueue() {
      if (this.currentSong) {
        return [this.currentSong].concat(this.queue)
      } else {
        return this.queue
      }
    },
    filteredSongs() {
      let filter = this.filter.trim().toLowerCase()
      if (filter === "") {
        return this.songs
      } else {
        return this.songs.filter(song => {
          return song.title.toLowerCase().includes(filter)
        })
      }
    }
  }
})

setInterval(() => {
  if (app.player) {
    app.songProgress = app.player.currentTime / app.player.duration
  }
}, 15)

db.ready.then(() => {
  app.songs = db.songs
  app.songs.sort((a, b) => a.title.localeCompare(b.title))
})

const srcCache = new Map()
function srcUrl(file) {
  if (srcCache.has(file)) {
    return srcCache.get(file)
  } else {
    const url = URL.createObjectURL(file)
    srcCache.set(file, url)
    return url
  }
}

navigator.serviceWorker.register("service-worker.js")