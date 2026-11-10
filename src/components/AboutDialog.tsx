import { AlertDialog, Button, Kbd, Link, Modal } from '@heroui/react'
import { CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { ENGINE_NAME } from '../core'

interface Props {
  hasLocalData: boolean
  onClear: () => Promise<string | null>
}

const SHORTCUTS: [string, string][] = [
  ['←', 'Previous move'],
  ['→', 'Next move'],
  ['Home', 'First position'],
  ['End', 'Last position'],
  ['F', 'Flip board'],
  ['Esc', 'Leave an explored line'],
]

export function AboutDialog({ hasLocalData, onClear }: Props) {
  const [clearError, setClearError] = useState<string | null>(null)
  const [cleared, setCleared] = useState(false)

  return (
    <Modal>
      <Button size="sm" variant="ghost" className="about-trigger" aria-label="About Chess Analyser">
        <CircleHelp size={16} /> About
      </Button>
      <Modal.Backdrop>
        <Modal.Container size="md" scroll="inside">
          <Modal.Dialog className="about">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>About Chess Analyser</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="about__body">
              <section>
                <h3>Where your data goes</h3>
                <p>
                  Games come from Chess.com's public game archive. Nothing else is contacted. Analysis runs in this
                  browser, and imported games and finished reviews are saved in this browser's storage.
                </p>
              </section>
              <section>
                <h3>Scores</h3>
                <p>
                  Accuracy and move grades are this app's own measures, based on the published Lichess move-accuracy
                  formula. They are not Chess.com's scores and will differ from them.
                </p>
              </section>
              <section>
                <h3>Engine</h3>
                <p>
                  {ENGINE_NAME} (Stockfish.js 19.0.1), licensed under the GNU GPL v3.{' '}
                  <Link href="/engine/NOTICE.txt" target="_blank">Notice</Link>
                  {' · '}
                  <Link href="/engine/COPYING.txt" target="_blank">Licence</Link>
                  {' · '}
                  <Link href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1" target="_blank" rel="noreferrer noopener">Source</Link>
                </p>
              </section>
              <section>
                <h3>Keyboard</h3>
                <dl className="shortcuts">
                  {SHORTCUTS.map(([key, label]) => (
                    <div key={key}>
                      <dt><Kbd>{key}</Kbd></dt>
                      <dd>{label}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section>
                <h3>Local data</h3>
                {cleared ? (
                  <p role="status">Saved games and reviews were removed from this browser.</p>
                ) : (
                  <div className="about__clear">
                    <p>Remove saved games, reviews and the remembered username from this browser.</p>
                    <AlertDialog>
                      <Button size="sm" variant="danger-soft" isDisabled={!hasLocalData}>Clear local data</Button>
                      <AlertDialog.Backdrop>
                        <AlertDialog.Container size="sm">
                          <AlertDialog.Dialog>
                            {({ close }) => (
                              <>
                                <AlertDialog.Header>
                                  <AlertDialog.Icon status="danger" />
                                  <AlertDialog.Heading>Clear local data?</AlertDialog.Heading>
                                </AlertDialog.Header>
                                <AlertDialog.Body>
                                  <p>Imported games and reviews will be deleted from this browser. Your Chess.com account is not affected.</p>
                                </AlertDialog.Body>
                                <AlertDialog.Footer>
                                  <Button variant="tertiary" slot="close">Keep data</Button>
                                  <Button
                                    variant="danger"
                                    onPress={async () => {
                                      const error = await onClear()
                                      setClearError(error)
                                      if (!error) setCleared(true)
                                      close()
                                    }}
                                  >
                                    Clear data
                                  </Button>
                                </AlertDialog.Footer>
                              </>
                            )}
                          </AlertDialog.Dialog>
                        </AlertDialog.Container>
                      </AlertDialog.Backdrop>
                    </AlertDialog>
                  </div>
                )}
                {clearError && <p className="text-danger" role="alert">{clearError}</p>}
              </section>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
