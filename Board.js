class Board{
  #Board = new Array(15).fill(0).map((val) => {
    return ".".repeat(15).split("")
  })
  constructor(){
    this.#Board.map((val) =>{
      return ".".repeat(15)
    })
  }

  get Rows(){
    return this.#Board
  }

  set Rows(rows){
    this.#Board = rows
  }

  get Columns(){
    return this.#Board.map((row, i) => {
      return row.map((val, j) => {
        return this.#Board[j][i]
      })
    }).map((row) => {
      return row.join("")
    })
  }

  set Columns(columns){
    columns = columns.map(row => row.split(""))
    console.log(columns)
    this.#Board = columns.map((row, i) => {
      return row.map((val, j) => {
        console.log(this.#Board)
        console.log(j)
        return columns[j][i]
      })
    })
  }
}

b = new Board()
var Cs = b.Columns
Cs[2] = ".....hello.world"
console.log(Cs)
b.Columns = Cs
console.log("--------")
console.log(b.Rows)
console.log(b.Columns)
