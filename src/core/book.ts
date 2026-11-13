import { bookKey, hashKey } from './book-key'

/** Hashed positions reachable through named openings. */
export type OpeningBook = ReadonlySet<number>

let book: Promise<OpeningBook> | undefined

/** Loads the bundled opening book on demand (separate ~40 kB chunk). */
export function loadOpeningBook(): Promise<OpeningBook> {
  book ??= import('./openings-data').then(({ BOOK_POSITIONS }) => {
    const bytes = Uint8Array.from(atob(BOOK_POSITIONS), char => char.charCodeAt(0))
    return new Set(new Uint32Array(bytes.buffer))
  }).catch(error => { book = undefined; throw error })
  return book
}

export function isBookPosition(book: OpeningBook, fen: string): boolean {
  return book.has(hashKey(bookKey(fen)))
}
