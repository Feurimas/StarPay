import { Plus, Search, Users } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Money } from '@/components/commerce'
import { Alert, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { COUNTRIES, countryName } from '@/lib/countries'

export interface CustomerSummary {
  id: string
  name: string
  email: string
  phone: string | null
  country: string | null
  orderCount: number
  totalOrdered: string
}

export default function Customers() {
  const { workspace, can } = useWorkspace()
  const [list, setList] = useState<CustomerSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', country: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  const load = useCallback(async () => {
    setList((await api.get<{ customers: CustomerSummary[] }>(`/workspaces/${workspace.id}/customers?q=${encodeURIComponent(debounced)}`)).customers)
  }, [workspace.id, debounced])

  useEffect(() => {
    let cancelled = false
    api
      .get<{ customers: CustomerSummary[] }>(`/workspaces/${workspace.id}/customers?q=${encodeURIComponent(debounced)}`)
      .then((r) => !cancelled && setList(r.customers))
      .catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [workspace.id, debounced])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post(`/workspaces/${workspace.id}/customers`, form)
      await load()
      setOpen(false)
      setForm({ name: '', email: '', phone: '', country: '' })
      toast.success('Customer added.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description="People who ordered from you, plus customers you add yourself."
        action={can('customers.manage') && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Add customer</Button>}
      />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input aria-label="Search customers" placeholder="Search by name or email" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {!list ? (
        <Spinner label="Loading customers" />
      ) : list.length === 0 ? (
        <Card><EmptyState icon={<Users className="h-5 w-5" />} title="No customers found" description="Customers appear here when someone places an order, or when you add them." /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <Link to={`/app/${workspace.id}/customers/${c.id}`} className="flex min-h-[4.5rem] items-center gap-4 px-4 py-3 hover:bg-surface-muted sm:px-6">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-soft text-sm font-bold text-violet">{c.name.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted">{[c.email, countryName(c.country)].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="tabular-nums text-muted">{c.orderCount} order{c.orderCount === 1 ? '' : 's'}</p>
                    <Money value={c.totalOrdered} className="font-semibold" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={open} title="Add customer" onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void create(e)} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Name" htmlFor="c-name"><Input id="c-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="c-email"><Input id="c-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone" htmlFor="c-phone"><Input id="c-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Country" htmlFor="c-country">
            <Select id="c-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
              <option value="">Not set</option>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
          </Field>
          <Button type="submit" loading={busy} className="w-full">Add customer</Button>
        </form>
      </Modal>
    </>
  )
}
