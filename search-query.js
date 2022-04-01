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
        // value = escapeRegExp(value)
        // value = value.replace("*", ".*")

        if (!param) param = "*"

        let existingTerms = searchTerms[param]
        if (!existingTerms) existingTerms = searchTerms[param] = []

        existingTerms.push({ negative : !!negative, str: value })
      }
    }
  }

  matches(song) {
    const terms = this.searchTerms

    for (const param in terms) {
      // const term = terms[param]
      // const regex = new RegExp(term.str.map(term => term.str).join("|"), "i")
      if (param === "*") {
        for (const term of terms[param]) {
          const regex = new RegExp(term.str, "i")

          let some = false
          for (let [playlist] of song.playlists) {
            if (regex.test(playlist)) {
              some = true
              break
            }
          }

          some = some || [song.artist, song.album, song.title].some(str => regex.test(str))

          if (some === term.negative) return false
        }
      } else if (param === "playlist") {
        const playlists = song.playlists

        for (const term of terms[param]) {
          const regex = new RegExp(term.str, "i")

          let some = false
          for (let [playlist] of playlists) {
            if (regex.test(playlist)) {
              some = true
              break
            }
          }

          if (some === term.negative) return false
        }
      } else {
        const value = song[param].toLowerCase()

        for (const term of terms[param]) {
          const incl = new RegExp(term.str).test(value)
          if (incl === term.negative) {
            return false
          }
        }
      }
    }

    return true
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}