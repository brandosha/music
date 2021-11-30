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
    const shared = ["nav", "options", "toggleOptions", "addToQueue", "playNow", "beginEditing", "playlist", "currentPage", "remove"]
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
      willCancelClick: false
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

        el.onpointerenter = e => {
          this.pointerEnter(i, e)
        }
      }
    },
    pointerDown(i, e) {
      this.moving = i
      this.didMove = false
      this.willCancelClick = false

      this.pointerDownTimestamp = Date.now()
    },
    pointerEnter(i) {
      if (this.moving !== null) {
        const list = this.value

        const movingVal = list[this.moving]
        list.splice(this.moving, 1)
        list.splice(i, 0, movingVal)
        this.$emit("input", list)
        this.$emit("reorder", { from: this.moving, to: i })

        this.moving = i
        this.didMove = true
      }
    },
    pointerUp(e) {
      if (this.moving !== null) {
        this.moving = null

        if (this.didMove || Date.now() - this.pointerDownTimestamp > this.ignoreHoldDuration) {
          this.willCancelClick = true
        }
      }
    }
  },
  mounted() {
    window.addEventListener("pointerup", e => {
      this.pointerUp(e)
      return false
    })
    window.addEventListener("click", e => {
      if (this.willCancelClick) {
        e.preventDefault()
        e.stopPropagation()

        this.willCancelClick = false
      }
    }, { capture: true })

    this.updateEvents()
  },
  updated() {
    this.updateEvents()
  }
})