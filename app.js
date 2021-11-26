var app = new Vue({
  el: "#app",
  data: {
    view: "library",
    songs: [],
    queue: [],
    
    currentSong: null,
    songProgress: 0,
    paused: false,

    filter: "",
    willShuffle: false,
    willLoop: false,

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

      const player = new Audio()

      const queueObj = { song, player }
      if (front) {
        this.queue.unshift(queueObj)
      } else {
        this.queue.push(queueObj)
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
        this.player.currentTime = this.player.duration - 0.0001
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
      let filter = this.filter.trim().toLowerCase()
      if (filter === "") {
        return this.songs
      } else {
        return this.songs.filter(song => {
          return song.title.toLowerCase().includes(filter)
        })
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