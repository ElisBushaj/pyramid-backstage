import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useLogin, useMe } from '@/api/hooks'
import { APIError } from '@/api/api-error'
import { useT } from '@/i18n/useT'
import { AuthShell } from '@/components/shell/AuthShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

/**
 * Branch the failed-login copy on status: bad credentials (401/403) vs. throttling
 * (429) vs. anything else — a 5xx or a network/non-APIError must not read as "wrong
 * password" (audit F19). Returns undefined when there's no error to show.
 */
function loginErrorKey(err: unknown): string | undefined {
  if (!err) return undefined
  if (err instanceof APIError) {
    if (err.status === 401 || err.status === 403) return 'auth.invalid'
    if (err.status === 429) return 'auth.rateLimited'
  }
  return 'auth.failed'
}

export default function Login() {
  const t = useT()
  const navigate = useNavigate()
  const login = useLogin()
  const me = useMe().data
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Already signed in (e.g. opened /login from a bookmark) — bounce to the right home.
  if (me) return <Navigate to={me.role === 'PARTNER' ? '/portal' : '/'} replace />

  const errorKey = loginErrorKey(login.error)
  const message = errorKey ? t(errorKey) : undefined

  // Editing either field clears a stale error banner so it can't linger over a new attempt.
  function clearError() {
    if (login.error) login.reset()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    // F15 — partners land in the portal; staff land in the Command Center.
    login.mutate({ email, password }, { onSuccess: (user) => navigate(user.role === 'PARTNER' ? '/portal' : '/') })
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <FormField label={t('auth.email')} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="name@pyramid.al"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              clearError()
            }}
            required
          />
        </FormField>
        <FormField label={t('auth.password')} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              clearError()
            }}
            required
          />
        </FormField>
        {message ? (
          <p role="alert" className="rounded-control bg-danger-subtle px-3 py-2 text-[13px] text-danger">
            {message}
          </p>
        ) : null}
        <Button type="submit" size="lg" fullWidth loading={login.isPending} disabled={!email || !password}>
          {login.isPending ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
      </form>
    </AuthShell>
  )
}
