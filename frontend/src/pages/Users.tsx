import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useUsers, useCreateUser, useUpdateUser } from '@/api/hooks'
import { APIError } from '@/api/api-error'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Table, THead, TH, TR, TD } from '@/components/ui/Table'
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/Dialog'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import type { Role } from '@/api/types/auth'

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'OPS', 'VIEWER']

export default function Users() {
  const t = useT()
  const { data, isLoading, isError, error } = useUsers()
  const create = useCreateUser()
  const update = useUpdateUser()
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'VIEWER' as Role })

  if (isError && error instanceof APIError && error.status === 403) return <ErrorState title={t('users.forbidden')} />

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('users.title')}
        actions={
          <Dialog>
            <DialogTrigger asChild><Button><UserPlus className="size-4" /> {t('users.create')}</Button></DialogTrigger>
            <DialogContent title={t('users.create')}>
              <div className="flex flex-col gap-3">
                <FormField label={t('users.name')}><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FormField>
                <FormField label={t('users.email')}><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></FormField>
                <FormField label={t('auth.password')}><Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></FormField>
                <FormField label={t('users.role')}>
                  <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </FormField>
                <div className="flex justify-end gap-2">
                  <DialogClose asChild><Button variant="ghost">{t('ui.common.cancel')}</Button></DialogClose>
                  <DialogClose asChild>
                    <Button loading={create.isPending} disabled={!form.email || !form.name || form.password.length < 8} onClick={() => create.mutate(form)}>{t('ui.common.save')}</Button>
                  </DialogClose>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {isLoading ? (
        <LoadingBlock />
      ) : data && data.length === 0 ? (
        <EmptyState title={t('users.empty')} />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t('users.name')}</TH>
              <TH>{t('users.email')}</TH>
              <TH>{t('users.role')}</TH>
              <TH>{t('users.active')}</TH>
            </TR>
          </THead>
          <tbody>
            {(data ?? []).map((u) => (
              <TR key={u.id} className="hover:bg-transparent">
                <TD className="font-[550] text-text-primary">{u.name}</TD>
                <TD className="font-mono text-[12px]">{u.email}</TD>
                <TD>
                  <Select className="w-32" value={u.role} onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </TD>
                <TD>
                  <input type="checkbox" checked={u.isActive} onChange={(e) => update.mutate({ id: u.id, body: { isActive: e.target.checked } })} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
