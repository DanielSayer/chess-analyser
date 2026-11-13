/**
 * Identity of a position for opening-book lookup: placement, side to move and
 * castling rights. The en passant field is dropped because tools disagree on
 * whether to write it when no capture is legal.
 */
export function bookKey(fen: string): string {
  return fen.split(' ').slice(0, 3).join(' ')
}

/** 32-bit FNV-1a. ~8k book positions makes false matches negligible. */
export function hashKey(key: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
