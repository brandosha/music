var app = new Vue({
  el: "#app",
  data: {
    view: "library",
    songs: [],
    queue: [],
    currentSong: null,
    filter: "",
  },
  methods: {
    addToQueue(song, front = false) {
      if (this.queue.length === 0 && this.currentSong === null) {
        this.play(song)
      } else {
        if (front) {
          this.queue.unshift(song)
          song.getFile()
        } else {
          this.queue.push(song)
        }
      }
    },
    playNext() {
      const nextSong = this.queue.shift()
      this.currentSong = nextSong

      if (nextSong) {
        this.play(nextSong)
      }

      // Preload next song
      const afterNext = this.queue[0]
      if (afterNext) { afterNext.getFile() }
    },
    async play(song) {
      this.currentSong = song
      player.play()

      const file = await song.getFile()
      player.src = srcUrl(file)
      // player.currentTime = 0
      player.play()
    },
    async skip() {
      const nextSong = this.queue[0]
      if (nextSong) {
        await nextSong.getFile()
        player.currentTime = player.duration - 0.1
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

const player = document.getElementsByTagName("audio")[0]
player.addEventListener("ended", app.playNext)

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