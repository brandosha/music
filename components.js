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
  props: ["song", "i", "showArtist", "showAlbum"],
  data() {
    const shared = ["nav", "options", "toggleOptions", "addToQueue", "playNow", "infoView", "playlist", "currentPage", "remove"]
    const data = {}
    shared.forEach(key => {
      data[key] = app[key]
    })

    return data
  },
  template: document.getElementById("song-row").innerHTML
})

Vue.component("song-list", {
  props: {
    songs: {
      type: Array
    }
  },
  template: document.getElementById("song-list").innerHTML
})

Vue.component("reorderable", {
  props: {
    value: {
      type: Array
    },
    keyPath: {
      type: String
    },
    ignoreHoldDuration: {
      type: Number,
      default: 500
    }
  },
  data() {
    return {
      moving: null,
      didMove: false,
      pointerDownTimestamp: null,
      willCancelClick: false,

      beginMovingTimeout: null,
      pointerIndex: null
    }
  },
  template: document.getElementById("reorderable"),
  methods: {
    updateEvents() {
      /** @type { HTMLDivElement } */
      const rootEl = this.$el

      const children = rootEl.children
      for (let i = 0; i < children.length; i++) {
        const el = children[i]

        el.onpointerdown = e => {
          this.pointerDown(i, e)
        }
      }
    },
    pointerDown(i, e) {
      this.didMove = false
      this.willCancelClick = false

      this.pointerDownTimestamp = Date.now()
      this.pointerIndex = i

      this.beginMovingTimeout = setTimeout(() => {
        this.moving = i
      }, 250);

      e.preventDefault()
      e.stopPropagation()
    },
    pointerEnter(i) {
      if (this.moving === null) {
        clearTimeout(this.beginMovingTimeout)
        this.beginMovingTimeout = null

        return
      }
      if (i === this.moving) return

      const list = this.value

      const movingVal = list[this.moving]
      list.splice(this.moving, 1)
      list.splice(i, 0, movingVal)
      this.$emit("input", list)
      this.$emit("reorder", { from: this.moving, to: i })

      this.moving = i
      this.elIndex = i
      this.didMove = true
    },
    pointerUp(e) {
      if (this.moving !== null) {
        this.moving = null

        if (this.didMove || Date.now() - this.pointerDownTimestamp > this.ignoreHoldDuration) {
          this.willCancelClick = true
        }
      }
    },

    pointerMove(mouseX, mouseY, e) {
      if (this.moving === null && this.beginMovingTimeout === null) return

      /** @type { HTMLDivElement } */
      const rootEl = this.$el

      const rootRect = rootEl.getBoundingClientRect()
      let top = rootRect.top - rootEl.scrollTop
      let index = 0

      for (const el of rootEl.children) {
        const rect = el.getBoundingClientRect()
        const bottom = top + rect.height

        if (mouseY >= top && mouseY <= bottom) {
          if (this.pointerIndex !== index) {
            this.pointerEnter(index)
            this.pointerIndex = index
          }

          break
        }

        top = bottom
        index += 1
      }

      if (mouseY > rootRect.bottom) {
        rootEl.scrollTop += (mouseY - rootRect.bottom) / 5
      } else if (mouseY < rootRect.top) {
        rootEl.scrollTop -= (rootRect.top - mouseY) / 5
      }

      e.preventDefault()
    }
  },
  mounted() {
    window.addEventListener("pointerup", e => {
      this.pointerUp(e)
      return false
    })

    window.addEventListener("pointermove", e => {
      this.pointerMove(e.clientX, e.clientY, e)
    })

    // prevent click event from firing after moving
    window.addEventListener("click", e => {
      if (this.willCancelClick) {
        e.preventDefault()
        e.stopPropagation()

        this.willCancelClick = false
      } else {
        this.moving = null
        clearTimeout(this.beginMovingTimeout)
        this.beginMovingTimeout = null
      }
    }, { capture: true })

    // prevent scrolling on touch devices
    window.addEventListener("touchmove", e => {
      if (this.moving !== null) e.preventDefault()
    }, { passive: false })
    this.$el.addEventListener("scroll", e => {
      clearTimeout(this.beginMovingTimeout)
      this.beginMovingTimeout = null
    }, { passive: true })

    this.updateEvents()
  },
  updated() {
    this.updateEvents()
  }
})