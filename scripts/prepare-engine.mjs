import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

// Ship the exact, unmodified single-threaded engine. No CDN or runtime download
// from a third party is necessary, and no cross-origin isolation is required.
const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'node_modules/stockfish')
const destination = resolve(root, 'public/engine')
await mkdir(destination, { recursive: true })
const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']
const hashes = {}
for (const file of files) {
  const input = resolve(source, 'bin', file)
  await copyFile(input, resolve(destination, file))
  hashes[file] = createHash('sha256').update(await readFile(input)).digest('hex')
}
await copyFile(resolve(source, 'Copying.txt'), resolve(destination, 'COPYING.txt'))
await writeFile(resolve(destination, 'NOTICE.txt'), [
  'Stockfish.js 19.0.1 by Nathan Rugg and the Stockfish contributors.',
  'Licensed under GNU GPL version 3. See COPYING.txt.',
  'Engine files are unmodified copies of stockfish@19.0.1.',
  'Complete corresponding source and build scripts:',
  'https://github.com/nmrugg/stockfish.js/tree/v19.0.1',
  'https://www.npmjs.com/package/stockfish/v/19.0.1',
  '',
  ...Object.entries(hashes).map(([file, hash]) => `SHA-256 ${file}: ${hash}`),
  '',
].join('\n'))
console.log('Prepared local Stockfish 19 engine and licence files.')
