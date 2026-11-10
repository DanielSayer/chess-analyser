import { Button, FieldError, Input, Label, Spinner, TextField } from '@heroui/react'
import { useState } from 'react'
import type { FormEvent } from 'react'

interface Props {
  busy: boolean
  pendingUsername: string | null
  initialValue: string
  onImport: (username: string) => Promise<string | null>
  onCancel: () => void
}

export function ImportForm({ busy, pendingUsername, initialValue, onImport, onCancel }: Props) {
  const [value, setValue] = useState(initialValue)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setFieldError(await onImport(value))
  }

  return (
    <form className="import-form" onSubmit={submit} noValidate aria-label="Import games">
      <TextField
        className="import-form__field"
        name="username"
        value={value}
        onChange={next => { setValue(next); setFieldError(null) }}
        isInvalid={fieldError !== null}
        validationBehavior="aria"
        fullWidth
      >
        <Label>Chess.com username</Label>
        <div className="import-form__row">
          <Input placeholder="Your username" autoComplete="off" spellCheck={false} autoCapitalize="none" />
          {busy ? (
            <Button type="button" variant="secondary" onPress={onCancel} aria-label={`Cancel import for ${pendingUsername ?? 'player'}`}>
              Cancel
            </Button>
          ) : (
            <Button type="submit" variant="primary">Import</Button>
          )}
        </div>
        <FieldError>{fieldError}</FieldError>
      </TextField>
      {busy && (
        <p className="import-form__status" role="status">
          <Spinner size="sm" color="current" /> Loading games for {pendingUsername}
        </p>
      )}
    </form>
  )
}
