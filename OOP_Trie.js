const { Buffer } = require("buffer")
const fs = require("fs")
const { config } = require("process")
const { threadId } = require("worker_threads")

class Trie {
  Display = {
    // the number of nodes to display before we attempt to
    // abbreviate the displayed tree
    nodeThreshold: 50,
    lone: "─",
    init: "┬",
    next: "├",
    skip: "│",
    last: "└",
    none: " ",
    reg: "╴",
    end: "╼",
  }

  Histogram = {
    height: 4,
    scale: "log",
    xMinor: "╹",
    xMajor: "╿",
    yMinor: "┃",
    yMajor: "┨",
  }
  _HistScales = {
    id: x => x,
    log: Math.log10,
    sqrt: Math.sqrt
  }
  _HistChars = " ▁▂▃▄▅▆▇█".split("")

  Alphabet = "abcdefghijklmnopqrstuvwxyz".split("")
  Blanks = ["_", "."]
  EndChar = "|"

  constructor(data = []) {
    this._tree = [{}]
    this._curr = 0
    switch (typeof (data)) {
      case "string":
        this._decideFile(data)
        break

      case "object":
        this.add_list(data)
    }
  }

  /** Decides whether the file is a trie file or a word list */
  _decideFile(name) {
    console.log(`trying to load file: ${name}`)
    const rgx = /.*\.([^\/][a-z]*)/g
    const matches = rgx.exec(name)
    switch (matches[1]) {
      case "tre":
        this.load(name)
        break

      case "txt":
        this.add_file(name)
    }
  }

  /*----------------------------------------------------------------
  -                      Word loading methods                      -
  ----------------------------------------------------------------*/

  /** Adds a file full of words to the trie */
  add_file(name) {
    return this.add_list(fs
      .readFileSync(name)
      .toString()
      .split("\n")
    )
  }

  /** Adds a list of words to the trie */
  add_list(list) {
    for (const word of list) {
      this.add_word(word)
    }
    return this
  }

  /** Adds a single word to the trie */
  add_word(word) {
    let i = 0
    for (const char of word) {
      let j = this._tree[i][char]
      if (!j) {
        j = this._tree.length
        this._tree[i][char] = j
        this._tree.push({})
      }
      i = j
    }
    this._tree[i][this.EndChar] = true
    return this
  }

  /*----------------------------------------------------------------
  -                      Word storing methods                      -
  ----------------------------------------------------------------*/

  /** Sets the words within a file to be the words within the trie */
  set_file(name) {
    const words = set_list([])
    fs.writeFileSync(name, words.join("\n"))
  }

  /** Sets a list to represent the words within the trie */
  set_list(words) {
    this._set_listRecur(words, 0, "")
    return words
  }

  _set_listRecur(words, i, s) {
    this._forEach((n, c) => {
      if (this._tree[n][this.EndChar]) words.push(s)
      this._listRecur(words, n, s + c)
    }, i)
    return words
  }

  /*----------------------------------------------------------------
  -                  Trie file saving and loading                  -
  ----------------------------------------------------------------*/
  /* Not entirely sure how to do this yet, maybe something to do
   * with demarkating the seperate objects with some kind of special
   * value, perhaps -1 or similar.
   */

  /** Encoding used:
   * Metadata (int8) at the start representing the number of digits
   * needed to represent any index in the trie as a multiple of 8.
   * 
   * Each child of a node is represented with a pair:
   * - (character, index)
   * -> character is a int8
   * -> 0-25 represent a-z
   * -> 26 represents an end character
   * -> 27 represents the end of a node
   *  -> if a 26 or 27 is observed, no index is expected
   */

  save(name) {
    let xs = []
    for (const node of this._tree) {
      for (const char in node) {
        if (char == this.EndChar) {
          xs.push(26 << 27)
          continue
        }
        const v = this._chrToInt(char)
        const i = node[char]
        xs.push((v << 27) | i)
      }
      xs.push(27 << 27)
    }

    const int32s = new Int32Array(xs)
    const int8s = new Uint8Array(int32s.buffer)
    fs.createWriteStream(name).write(int8s)
  }

  load(name) {
    const buff = fs.readFileSync(name)
    const int32s = new Int32Array(buff)
    let node = {}
    let tree = []
    let i = 0

    while (i < int32s.length) {
      const int = int32s[i]
      const x = int >>> 27
      if (x < 26) {
        const chr = this._intToChr(x)
        node[chr] = int & (1 << 26)
      } else if (x == 26) {
        node[this.EndChar] = true
      } else {
        tree.push(node)
        node = {}
      }
      i++
    }

    this._tree = tree
  }

  _intToChr = i => String.fromCharCode(i + 97)
  _chrToInt = c => c.charCodeAt(0) - 97

  /*----------------------------------------------------------------
  -                      Private trie methods                      -
  ----------------------------------------------------------------*/

  /**
   * Applies the function f to each node n in the trie, along with
   * the character it represents and the depth it lies at
   * 
   * @param {Function} f The function to apply to each node
   * @param {Integer} i The current node to apply on
   * @param {Integer} d The depth the method thinks it's at
   */
  _apply(f = (n, c, d) => { }, i = 0, d = 1) {
    this._forEach((n, c) => {
      f(this._tree[n], c, d)
      this._apply(f, n, d + 1)
    }, i)
  }

  /** Iterates over the children of a node */
  _forEach(f = (n, c) => { }, i = 0) {
    const node = this._tree[i]

    // this is slightly more efficient for sparse nodes
    for (const char in node) {
      if (char == this.EndChar) continue

      // we capture returned values and use them as a
      // indication to break out of the loop early
      const res = f(node[char], char)
      if (res != undefined) return res
    }
  }

  /*----------------------------------------------------------------
  -                    Statistic getter methods                    -
  ----------------------------------------------------------------*/

  /** The number of nodes in the trie */
  get length() {
    return this._tree.length
  }

  /** The fraction of nodes meeting condition f */
  fill(f = _ => true) {
    return this.count(f) / this.length
  }

  /** The number of nodes meeting condition f */
  count(f = _ => true) {
    let count = 0
    this._apply((_, c) => {
      if (f(c)) count++
    })
    return count
  }

  /** The number of words stored within the trie */
  nWords() {
    let count = 0
    this._apply(n => {
      if (n[this.EndChar]) count++
    })
    return count
  }

  /** The range of word lengths stored within the trie */
  lengths() {
    let lens = []
    this._apply((n, _2, d) => {
      if (n[this.EndChar]) {
        lens[d] = (lens[d] || 0) + 1
      }
    })
    return this._zeroFill(lens)
  }

  /** Fills any empty spaces within an array with 0s */
  _zeroFill(arr) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === undefined) arr[i] = 0
    }
    return arr
  }

  /*----------------------------------------------------------------
  -                      Trie showing methods                      -
  ----------------------------------------------------------------*/

  /** Returns a string of generic statistics about the trie */
  stats() {
    const I = this.lengths()
    const max = I.length - 1
    const min = I.findIndex(v => v > 0)
    let str = "Some statistics about the trie:\n"
    str += "Total no. nodes: " + this.length + "\n"
    str += "Total no. words: " + this.nWords() + "\n"
    str += `Words range between ${min} and ${max} letters`
    return str
  }

  /** Generates a histogram of word lengths within the trie */
  hist(config = {}) {
    // inherit unspecified config from a default
    config = Object.assign({}, this.Histogram, config)
    config.scale = this._HistScales[config.scale] || config.scale
    // apply our scaling function (e.g. log, sqrt, id, ...)
    const lengths = this.lengths().map(config.scale)
    const maxX = lengths.length

    // find the maximum length of our frequencies
    const maxY = Math.max(...lengths)
    const strL = `${maxY.toFixed(2)}`.length

    // get the main string components of the graph
    const area = this._chartArea(maxY, lengths, config)
    const xAxis = this._xAxis(maxX, strL, config)
    const yAxis = this._yAxis(maxY, strL, config)

    // combine them appropriately
    return yAxis
      .map((s, i) => s + area[i])
      .concat(xAxis).join("\n")
  }

  _yAxis(maxY, strL, config) {
    let axis = []

    for (let i = config.height - 1; i >= 0; i--) {
      const t = maxY * i / config.height
      const tick = (i % 5) ? config.yMinor : config.yMajor
      const label = `${t.toFixed(2)}`.padStart(strL, " ")
      axis.push(label + tick)
    }

    return axis
  }

  _xAxis(maxX, strL, config) {
    const pad = " ".repeat(strL)
    let axis = [pad, ""]

    for (let i = 0; i < maxX; i++) {
      if (i % 5 == 0) {
        axis[0] += config.xMajor
        axis[1] += i.toString().padStart(5, " ")
      }
      else axis[0] += config.xMinor
    }

    return axis
  }

  _chartArea(maxY, lengths, config) {
    let layers = []

    for (let i = config.height - 1; i >= 0; i--) {
      let str = ""
      for (let l of lengths) {
        l = l / maxY * config.height
        l = Math.min(Math.max(l - i, 0), 1)
        l = Math.round(l * (this._HistChars.length - 1))
        str += this._HistChars[l]
      }
      layers.push(str)
    }

    return layers
  }

  toString() {
    const N = this.length
    if (N == 0) return "{Empty trie}"
    else if (N < 50) return this._allWords().join("\n")
    else {
      const head = this._headWord()
      const last = this._lastWord()
      const x = N - head.length - last.length
      return `${head.join("\n")}\n[${x} nodes]\n${last.join("\n")}`
    }
  }

  /** Creates a string following every first branch in the trie */
  _headWord() {
    return this._headWordRecur(0)
  }

  _headWordRecur(i) {
    let strs = []
    const node = this._tree[i]
    for (const char of this.Alphabet) {
      if (!node[char]) continue
      const next = this._tree[node[char]]

      let start = this.Display.next + this.Display.init
      if (next[this.EndChar]) start += this.Display.end
      else start += this.Display.reg

      strs.push(start + char)
      strs = strs.concat(
        this._headWordRecur(node[char])
          .map(s => this.Display.skip + s)
      )
      return strs
    }
    return []
  }

  /** Creates a string following every last branch in the trie */
  _lastWord() {
    this.Alphabet.reverse()
    const last = this._lastWordRecur(0)
    this.Alphabet.reverse()
    return last
  }

  _lastWordRecur(i) {
    let strs = []
    const node = this._tree[i]
    for (const char of this.Alphabet) {
      if (!node[char]) continue
      const next = this._tree[node[char]]

      let start = this.Display.last + this.Display.init
      if (next[this.EndChar]) start += this.Display.end
      else start += this.Display.reg

      strs.push(start + char)
      strs = strs.concat(
        this._lastWordRecur(node[char])
          .map(s => this.Display.none + s)
      )
      return strs
    }
    return []
  }

  /** Creates a string representation of all branches in the trie */
  _allWords(i = 0) {
    let strs = []
    const node = this._tree[i]
    for (const char of this.Alphabet) {
      if (!node[char]) continue
      const next = this._tree[node[char]]

      let start = this.Display.next + this.Display.init
      if (next[this.EndChar]) start += this.Display.end
      else start += this.Display.reg

      strs.push(start + char)
      strs = strs.concat(
        this._allWords(node[char])
          .map(s => this.Display.skip + s)
      )
    }
    this._setSingles(strs)
    return this._cleanLast(strs)
  }

  /** Sets the correct character for branches containing a single node */
  _setSingles(strs) {
    if (strs.length == 0) return strs
    let next0 = strs[0].charAt(0)
    let next = next0 == this.Display.next ||
      next0 == this.Display.last

    for (let i = 0; i < strs.length; i++) {
      const curr = next
      next0 = (strs[i + 1] || this.Display.next).charAt(0)
      next = next0 == this.Display.next ||
        next0 == this.Display.last

      if (curr && next) strs[i] = strs[i].replace(
        this.Display.init, this.Display.lone
      )
    }
    return strs
  }

  /** Removes any trailing characters for the final few nodes */
  _cleanLast(strs) {
    for (let i = strs.length - 1; i >= 0; i--) {
      const str = strs[i]
      const head = str.charAt(0)
      const tail = str.slice(1)
      if (head == this.Display.skip) {
        strs[i] = this.Display.none + tail
      }
      if (head == this.Display.next) {
        strs[i] = this.Display.last + tail
        break
      }
    }
    return strs
  }

  /*----------------------------------------------------------------
  -                     Scrabble search methods                    -
  ----------------------------------------------------------------*/

  genPlays(line, hand) {
    hand = hand.split("")
    let allPlays = []
    const points = this.findStartPoints(line)

    for (const p of points) {
      const plays = this.walkTrie(line.slice(p), hand)
      for (const play of plays) {
        allPlays.push(line.slice(0, p) + play)
      }
    }

    return allPlays
  }

  findStartPoints(line) {
    let points = []
    points.push(0)

    for (let i = 0; i < line.length - 1; i++) {
      if (line[i] === ".") {
        points.push(i + 1)
      }
    }

    return points
  }

  /** A recursive algorithm for getting a list of plays */
  walkTrie(l, h, i = 0, p = "", plays = [], linked = false) {
    const n = this._tree[i]
    if (n[this.EndChar] && linked) plays.push(p + l)
    if (l.length == 0) return plays

    if (this.Blanks.includes(l[0])) {
      const sHand = [...new Set(h)]
      for (let t of sHand) {
        let nHand = [...h]
        nHand.splice(h.indexOf(t), 1)
        if (this.Blanks.includes(t)) {
          for (t in n) {
            if (t != this.EndChar) {
              plays = this.walkTrie(l.slice(1), nHand, n[t], p + t, plays, linked)
            }
          }
        } else {
          if (n[t]) {
            plays = this.walkTrie(l.slice(1), nHand, n[t], p + t, plays, linked)
          }
        }
      }
    } else {
      if (n[l[0]]) {
        plays = this.walkTrie(l.slice(1), h, n[l[0]], p + l[0], plays, true)
      }
    }
    return plays
  }

  /** Initial rewrite of walkTrie, it can be a fair bit more efficient */

  /*----------------------------------------------------------------
  -                     Trie modifying methods                     -
  ----------------------------------------------------------------*/

  /** Cuts down the trie to words of a given length
   * words w, where min <= w.length < max
   */
  trim(min, max = Infinity) {
    this._apply((n, _, d) => {
      const end = n[this.EndChar]
      if (end && d < min && d >= max) {
        delete n[this.EndChar]
      }
    })
    return this.cull()
  }

  /** Removes any dangling paths, i.e. paths without EOW characters */
  cull() {
    this._cullNull()
    this._tree = this._rebuild()
    return this
  }

  /**
   * Nulls all pointers to dangling nodes, i.e. sequences of nodes that
   * are not capped off by an EOW character
   * 
   * @param {Integer} i The node to cull from
   * @returns whether the node is now empty
   */
  _cullNull(i = 0) {
    let empty = true
    const node = this._tree[i]

    // iterate over the "children" of the node
    for (const char in node) {
      // this node is not dangling, so we leave it alone
      if (char == this.EndChar) empty = false

      // otherwise, we call cull on the the child
      else if (this._cullNull(node[char])) {
        delete node[char]
      } else empty = false
    }
    return empty
  }

  /** It's geniunely easier to generate a new copy of the trie than
   * to selectively remove nodes
   * (due to having to update *a lot* of pointers)
   */
  _rebuild(tree = [{}], i = 0, j = 0) {
    const node = this._tree[i]
    tree[j] = {}

    for (const char in node) {
      if (char == this.EndChar) {
        tree[j][this.EndChar] = true
        continue
      }
      tree[j][char] = tree.length
      this._rebuild(tree, node[char], tree.length)
    }
    return tree
  }

  /*----------------------------------------------------------------
  -                       Node based methods                       -
  ----------------------------------------------------------------*/

  fetch(letter, i = this._curr) {
    const j = this._tree[i][letter]
    if (j) this._curr = j
    return j
  }

  end(i = this._curr) {
    return this._tree[i][this.EndChar] == true
  }
}

const create = true
let trie
if (create) {
  const words = ["breeze", "break", "brat", "bear", "bee", "be", "beckon", "cat", "cauterize"]
  trie = new Trie("./Large.txt")
  trie.save("./Large.tre")
} else {
  trie = new Trie("./Large.tre")
}

console.log(trie.stats())
console.log(trie.hist({ height: 10 }))

trie.trim(2, 20)

console.log(trie.stats())
console.log(trie.hist({ height: 10 }))

console.time("Generation")
console.log(trie.genPlays("......d........", "aeths.."))
console.timeEnd("Generation")