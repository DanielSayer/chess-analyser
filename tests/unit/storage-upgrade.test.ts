import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { expect, it } from 'vitest'
import { TEST_GAME } from '../fixtures/games'

it('upgrades a version 1 database without losing games, and adds practice progress', async () => {
  globalThis.indexedDB = new IDBFactory()
  const old = await openDB('chess-analyser', 1, {
    upgrade(database) {
      database.createObjectStore('games', { keyPath: 'id' })
      database.createObjectStore('reviews', { keyPath: 'gameId' })
      database.createObjectStore('settings')
    },
  })
  await old.put('games', TEST_GAME)
  await old.put('settings', 'alice', 'lastUsername')
  old.close()

  const storage = await import('../../src/core/storage')
  expect(await storage.loadGames('alice')).toEqual([TEST_GAME])
  expect(await storage.loadLastUsername()).toBe('alice')
  await storage.savePracticeRecord({ id: 'x:1', attempts: 1, solved: 0, lastResult: 'failed', lastSeen: 1 })
  expect(await storage.loadPracticeRecords()).toHaveLength(1)
})
