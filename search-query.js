class SearchQuery {
  constructor(query) {
    query = query.trim()
    this.query = query

    query = query.toLowerCase()

    const searchTerms = this.searchTerms = { }

    if (query !== "") {
      const advancedSearchRegex = /(\s|^)(-)?(artist|album|playlist)?:?(".*?"|[^\s]*)/g
      const matches = query.matchAll(advancedSearchRegex)

      for (let [match, _, negative, param, value] of matches) {
        if (value.startsWith('"')) { value = value.slice(1) }
        if (value.endsWith('"')) { value = value.slice(0, -1) }

        value = value.trim()
        if (!value) continue

        if (!param) param = "title"

        let existingTerms = searchTerms[param]
        if (!existingTerms) existingTerms = searchTerms[param] = []

        existingTerms.push({ negative : !!negative, str: value })
      }
    }
  }

  matches(song) {
    const terms = this.searchTerms

    for (const param in terms) {
      if (param === "playlist") {
        const playlists = song.playlists

        for (const term of terms[param]) {

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

        for (const term of terms[param]) {
          const incl = value.includes(term.str)
          if (incl === term.negative) {
            return false
          }
        }
      }
    }

    return true
  }
}