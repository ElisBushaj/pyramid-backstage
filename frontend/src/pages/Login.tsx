import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLogin } from '@/api/hooks'
import { APIError } from '@/api/api-error'
import { useT } from '@/i18n/useT'
import { AuthShell } from '@/components/shell/AuthShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

export default function Login() {
  const t = useT()
  const navigate = useNavigate()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const error = login.error instanceof APIError ? login.error : undefined
  const message = error?.status === 429 ? t('auth.rateLimited') : error ? t('auth.invalid') : undefined

  function submit(e: React.FormEvent) {
    e.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => navigate('/') })
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
            onChange={(e) => setEmail(e.target.value)}
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
            onChange={(e) => setPassword(e.target.value)}
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
        <button type="button" className="mt-1 text-center text-[13px] text-accent hover:underline">
          {t('auth.forgot')}
        </button>
      </form>
    </AuthShell>
  )
}
