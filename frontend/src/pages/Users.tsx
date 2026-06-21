import { useState } from 'react'
import { Plus, MoreVertical, Pencil, UserCheck, UserX, Lock } from 'lucide-react'
import { useMe, useUsers, useCreateUser, useUpdateUser } from '@/api/hooks'
import { APIError } from '@/api/api-error'
import { useT } from '@/i18n/useT'
import { fieldErrorsFrom, useMutationToast } from '@/lib/apiError'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Switch } from '@/components/ui/Switch'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/DropdownMenu'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { DataTable, type DataTableColumn } from '@/components/command/DataTable'
import { Pager } from '@/components/command/Pager'
import type { Role, User } from '@/api/types/auth'

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'OPS', 'VIEWER', 'PARTNER']
const PAGE_SIZE = 20

// Canvas role → tone map (§9.1): MANAGER warning · OPS accent/info · ADMIN success · VIEWER neutral.
const ROLE_TONE: Record<Role, BadgeTone> = {
  ADMIN: 'success',
  MANAGER: 'warning',
  OPS: 'info',
  VIEWER: 'neutral',
  PARTNER: 'neutral',
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

type DialogState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; user: User }

interface FormShape {
  name: string
  email: string
  password: string
  role: Role
}

const EMPTY_FORM: FormShape = { name: '', email: '', password: '', role: 'VIEWER' }

export default function Users() {
  const t = useT()
  const onMutationError = useMutationToast()
  const me = useMe().data
  const isAdmin = me?.role === 'ADMIN'

  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error } = useUsers({ page, pageSize: PAGE_SIZE })
  const create = useCreateUser()
  const update = useUpdateUser()

  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
  const [form, setForm] = useState<FormShape>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  // Which row's active-toggle is mid-flight — disables that Switch so a double-tap
  // can't queue a contradictory PATCH while the first is in flight.
  const [pendingToggle, setPendingToggle] = useState<string | null>(null)

  // Forbidden — calm warning-toned lock card. Drive off the live role; a 403 from
  // the users query (race / direct nav) lands here too.
  const forbidden = (me && !isAdmin) || (isError && error instanceof APIError && error.status === 403)
  if (forbidden) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader breadcrumb={[t('nav.settings'), t('users.title')]} title={t('users.title')} />
        <div className="rounded-lg border border-border-subtle bg-surface px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[12px] bg-warning-subtle text-warning">
            <Lock className="size-[22px]" strokeWidth={2} aria-hidden />
          </div>
          <h2 className="text-[17px] font-[600] text-text-primary">{t('users.forbiddenTitle')}</h2>
          <p className="mx-auto mt-1.5 max-w-[340px] text-[14px] leading-5 text-text-tertiary">
            {t('users.forbiddenBody')}
          </p>
        </div>
      </div>
    )
  }

  const users = data?.data ?? []
  // Subtitle counts staff only — PARTNER rows are external accounts, not staff (audit F19).
  const staffCount = users.filter((u) => u.role !== 'PARTNER').length
  const otherError = isError && !(error instanceof APIError && error.status === 403)

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormErrors({})
    setDialog({ mode: 'create' })
  }

  function openEdit(user: User) {
    setForm({ name: user.name, email: user.email, password: '', role: user.role })
    setFormErrors({})
    setDialog({ mode: 'edit', user })
  }

  function closeDialog() {
    setDialog({ mode: 'closed' })
    setFormErrors({})
  }

  function toggleActive(user: User, next: boolean) {
    setPendingToggle(user.id)
    update.mutate(
      { id: user.id, body: { isActive: next } },
      {
        onError: onMutationError,
        onSettled: () => setPendingToggle((cur) => (cur === user.id ? null : cur)),
      },
    )
  }

  const isCreate = dialog.mode === 'create'
  const createValid = form.name.trim() && form.email.trim() && form.password.length >= 8
  const editValid = form.name.trim() && form.email.trim()
  const submitDisabled = isCreate ? !createValid : !editValid

  // On a 422 we keep the dialog open and surface per-field messages under the
  // offending FormFields; any other status falls through to the shared toast.
  function onSubmitError(err: unknown) {
    const fields = fieldErrorsFrom(err, t)
    if (Object.keys(fields).length > 0) setFormErrors(fields)
    else onMutationError(err)
  }

  function submitDialog() {
    setFormErrors({})
    if (dialog.mode === 'create') {
      create.mutate(
        { name: form.name, email: form.email, password: form.password, role: form.role },
        { onSuccess: closeDialog, onError: onSubmitError },
      )
    } else if (dialog.mode === 'edit') {
      update.mutate(
        { id: dialog.user.id, body: { name: form.name, email: form.email, role: form.role } },
        { onSuccess: closeDialog, onError: onSubmitError },
      )
    }
  }

  const columns: DataTableColumn<User>[] = [
    {
      key: 'name',
      header: t('users.name'),
      width: 'minmax(0,1fr)',
      render: (u) => (
        <div className="flex min-w-0 items-center gap-[9px]">
          <Avatar size="sm" initials={initials(u.name)} />
          <span className="truncate font-[550] text-text-primary">{u.name}</span>
        </div>
      ),
    },
    {
      key: 'email',
      header: t('users.email'),
      width: 'minmax(0,1fr)',
      render: (u) => (
        <span className="truncate font-mono text-[13px] text-text-secondary">{u.email}</span>
      ),
    },
    {
      key: 'role',
      header: t('users.role'),
      width: '130px',
      render: (u) => <Badge tone={ROLE_TONE[u.role]}>{t(`roles.${u.role}`)}</Badge>,
    },
    {
      key: 'active',
      header: t('users.active'),
      width: '90px',
      render: (u) => (
        <Switch
          checked={u.isActive}
          onCheckedChange={(next) => toggleActive(u, next)}
          disabled={pendingToggle === u.id}
          aria-label={t('users.active')}
        />
      ),
    },
    {
      key: 'menu',
      header: '',
      width: '60px',
      align: 'right',
      render: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="sm" aria-label={t('users.rowMenu')}>
              <MoreVertical className="size-4 text-text-tertiary" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem onSelect={() => openEdit(u)}>
              <Pencil />
              {t('users.editUser')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {u.isActive ? (
              <DropdownMenuItem variant="destructive" onSelect={() => toggleActive(u, false)}>
                <UserX />
                {t('users.deactivate')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => toggleActive(u, true)}>
                <UserCheck />
                {t('users.activate')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.settings'), t('users.title')]}
        title={t('users.title')}
        subtitle={isLoading ? undefined : t('users.count', { n: staffCount })}
        actions={
          isLoading ? undefined : (
            <Button onClick={openCreate}>
              <Plus className="size-[13px]" strokeWidth={2.5} />
              {t('users.create')}
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        rows={users}
        rowKey={(u) => u.id}
        loading={isLoading}
        error={otherError}
        emptyConfig={{ title: t('users.empty'), message: t('users.emptyBody') }}
        errorConfig={{
          title: t('users.errorTitle'),
          message: t('users.errorBody'),
        }}
      />

      {data && !isLoading ? (
        <Pager
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          totalPages={data.totalPages}
          onPageChange={setPage}
        />
      ) : null}

      <Dialog open={dialog.mode !== 'closed'} onOpenChange={(open) => !open && closeDialog()}>
        {dialog.mode !== 'closed' ? (
          <DialogContent title={isCreate ? t('users.create') : t('users.editUser')}>
            <div className="flex flex-col gap-3.5">
              <FormField label={t('users.name')} error={formErrors.name}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </FormField>
              <FormField label={t('users.email')} error={formErrors.email}>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </FormField>
              {isCreate ? (
                <FormField
                  label={t('auth.password')}
                  hint={t('users.passwordHint')}
                  error={formErrors.password}
                >
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </FormField>
              ) : null}
              <FormField label={t('users.role')} error={formErrors.role}>
                <Select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`roles.${r}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div className="mt-1 flex justify-end gap-2.5">
                <Button variant="secondary" onClick={closeDialog}>
                  {t('ui.common.cancel')}
                </Button>
                <Button
                  loading={isCreate ? create.isPending : update.isPending}
                  disabled={Boolean(submitDisabled)}
                  onClick={submitDialog}
                >
                  {t('ui.common.save')}
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
