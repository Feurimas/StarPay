import { Percent, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Money } from '@/components/commerce'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { cleanAmountInput } from '@/lib/usdc'

interface Discount {
  id: string
  code: string
  kind: 'percent' | 'fixed'
  value: string
  minSubtotal: string
  maxUses: number | null
  usedCount: number
  startsAt: string | null
  endsAt: string | null
  active: boolean
}

const EMPTY = { code: '', kind: 'percent', value: '10', minSubtotal: '', maxUses: '', startsAt: '', endsAt: '' }

export default function Discounts() {
  const { workspace, can, prefs } = useWorkspace()
  const base = `/workspaces/${workspace.id}/discounts`
  const [list, setList] = useState<Discount[] | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const manage = can('discounts.manage')

  const load = useCallback(async () => {
    setList((await api.get<{ discounts: Discount[] }>(base)).discounts)
  }, [base])

  useEffect(() => {
    let cancelled = false
    api
      .get<{ discounts: Discount[] }>(base)
      .then((r) => !cancelled && setList(r.discounts))
      .catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [base])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const value = form.kind === 'fixed' ? cleanAmountInput(form.value) : form.value
      if (!value) throw new Error('Enter a discount amount such as 5.00.')
      const min = form.minSubtotal ? cleanAmountInput(form.minSubtotal) : ''
      if (form.minSubtotal && !min) throw new Error('Enter a minimum order such as 40.00.')
      await api.post(base, {
        code: form.code, kind: form.kind, value, minSubtotal: min || undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      })
      await load()
      setOpen(false)
      setForm(EMPTY)
      toast.success('Discount created.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Discounts"
        description="Codes customers enter at checkout. Discounts are checked on the server every time."
        action={manage && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> New discount</Button>}
      />
      {!list ? (
        <Spinner label="Loading discounts" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<Percent className="h-5 w-5" />} title="No discounts yet" description="Create a code to offer a percentage or fixed USDC amount off." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {list.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="mono text-sm font-semibold">{d.code}</p>
                  <p className="text-xs text-muted">
                    {d.kind === 'percent' ? `${d.value}% off` : <>{'Fixed '}<Money value={d.value} /> off</>}
                    {d.minSubtotal !== '0' && <> · min <Money value={d.minSubtotal} /></>}
                    {' · '}used {d.usedCount}{d.maxUses ? ` of ${d.maxUses}` : ''}
                    {d.endsAt && ` · ends ${formatDate(d.endsAt, prefs)}`}
                  </p>
                </div>
                <Badge tone={d.active ? 'success' : 'neutral'}>{d.active ? 'Active' : 'Paused'}</Badge>
                {manage && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void act(() => api.patch(`${base}/${d.id}`, { active: !d.active }))}>
                      {d.active ? 'Pause' : 'Resume'}
                    </Button>
                    <button
                      aria-label={`Delete ${d.code}`}
                      onClick={() => confirm(`Delete ${d.code}?`) && void act(() => api.delete(`${base}/${d.id}`))}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={open} title="New discount" onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void create(e)} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Code" htmlFor="d-code" hint="Letters, numbers, hyphens. Case does not matter.">
            <Input id="d-code" required minLength={3} maxLength={30} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="d-kind">
              <Select id="d-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, value: e.target.value === 'percent' ? '10' : '5' })}>
                <option value="percent">Percent off</option>
                <option value="fixed">Fixed USDC off</option>
              </Select>
            </Field>
            <Field label={form.kind === 'percent' ? 'Percent (1-100)' : 'Amount (USDC)'} htmlFor="d-value">
              <Input id="d-value" required inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum order (USDC)" htmlFor="d-min">
              <Input id="d-min" inputMode="decimal" placeholder="None" value={form.minSubtotal} onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })} />
            </Field>
            <Field label="Max uses" htmlFor="d-max">
              <Input id="d-max" type="number" min={1} placeholder="Unlimited" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" htmlFor="d-start">
              <Input id="d-start" type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </Field>
            <Field label="Ends" htmlFor="d-end">
              <Input id="d-end" type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </Field>
          </div>
          <Button type="submit" loading={busy} className="w-full">
            Create discount
          </Button>
        </form>
      </Modal>
    </>
  )
}
