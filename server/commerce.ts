import { audit, requireMember, type Ctx } from './context'
import { rows, sql } from './db'
import { asBody, badRequest, bool, conflict, int, isUuid, notFound, oneOf, str } from './http'
import { big, parsePrice, usd } from './money'

const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const
const MAX_IMAGES = 6
const MAX_IMAGE_BYTES = 1_500_000

// ---------- categories ----------
export async function listCategories(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.view')
  const list = await rows<{ id: string; name: string; products: number }>(sql`
    SELECT c.id, c.name, (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.status <> 'archived') AS products
    FROM categories c WHERE c.workspace_id = ${m.workspace.id} ORDER BY lower(c.name)`)
  return { categories: list }
}

export async function createCategory(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.manage')
  const name = str(asBody(await ctx.body()), 'name', { min: 2, max: 60 })
  try {
    const r = await rows<{ id: string }>(sql`INSERT INTO categories (workspace_id, name) VALUES (${m.workspace.id}, ${name}) RETURNING id`)
    return { id: r[0]!.id }
  } catch {
    throw conflict('A category with that name already exists.')
  }
}

export async function deleteCategory(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.manage')
  const id = ctx.params.cid ?? ''
  if (!isUuid(id)) throw notFound()
  await sql`DELETE FROM categories WHERE id = ${id} AND workspace_id = ${m.workspace.id}`
  return { ok: true }
}

// ---------- products ----------
interface ProductRow {
  id: string
  name: string
  description: string
  price_units: unknown
  sku: string | null
  track_inventory: boolean
  stock: number
  status: string
  category_id: string | null
  category_name: string | null
  image_id: string | null
  updated_at: Date
}

const productDto = (p: ProductRow) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  price: usd(p.price_units),
  sku: p.sku,
  trackInventory: p.track_inventory,
  stock: p.stock,
  status: p.status,
  categoryId: p.category_id,
  categoryName: p.category_name,
  imageId: p.image_id,
  updatedAt: p.updated_at,
})

export async function listProducts(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.view')
  const status = ctx.url.searchParams.get('status')
  const list = await rows<ProductRow>(sql`
    SELECT p.id, p.name, p.description, p.price_units, p.sku, p.track_inventory, p.stock, p.status, p.category_id,
           c.name AS category_name, p.updated_at,
           (SELECT i.id FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.created_at LIMIT 1) AS image_id
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.workspace_id = ${m.workspace.id}
      AND (${status}::text IS NULL OR p.status = ${status}::text)
      AND (${status}::text IS NOT NULL OR p.status <> 'archived')
    ORDER BY p.created_at DESC`)
  return { products: list.map(productDto) }
}

export async function getProduct(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.view')
  const id = ctx.params.pid ?? ''
  if (!isUuid(id)) throw notFound('Product not found.')
  const found = await rows<ProductRow>(sql`
    SELECT p.id, p.name, p.description, p.price_units, p.sku, p.track_inventory, p.stock, p.status, p.category_id,
           c.name AS category_name, p.updated_at, NULL::uuid AS image_id
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ${id} AND p.workspace_id = ${m.workspace.id}`)
  if (!found[0]) throw notFound('Product not found.')
  const images = await rows<{ id: string }>(sql`SELECT id FROM product_images WHERE product_id = ${id} ORDER BY position, created_at`)
  return { product: productDto(found[0]), imageIds: images.map((i) => i.id) }
}

async function parseProduct(m: { workspace: { id: string } }, body: Record<string, unknown>) {
  const name = str(body, 'name', { min: 2, max: 120 })
  const description = str(body, 'description', { max: 4000, optional: true })
  const price = parsePrice(body.price, 'Price', { allowZero: true })
  const sku = str(body, 'sku', { max: 60, optional: true }) || null
  const trackInventory = bool(body, 'trackInventory')
  const stock = trackInventory ? (int(body, 'stock', { min: 0, max: 1_000_000 }) ?? 0) : 0
  const status = oneOf(body, 'status', PRODUCT_STATUSES)
  const rawCat = str(body, 'categoryId', { optional: true })
  let categoryId: string | null = null
  if (rawCat) {
    if (!isUuid(rawCat)) throw badRequest('Choose a valid category.')
    const own = await rows<{ id: string }>(sql`SELECT id FROM categories WHERE id = ${rawCat} AND workspace_id = ${m.workspace.id}`)
    if (!own[0]) throw badRequest('Choose a valid category.')
    categoryId = rawCat
  }
  if (status === 'active' && price === 0n) throw badRequest('Set a price above zero before publishing a product.')
  return { name, description, price, sku, trackInventory, stock, status, categoryId }
}

export async function createProduct(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.manage')
  const p = await parseProduct(m, asBody(await ctx.body()))
  const r = await rows<{ id: string }>(sql`
    INSERT INTO products (workspace_id, category_id, name, description, price_units, sku, track_inventory, stock, status)
    VALUES (${m.workspace.id}, ${p.categoryId}, ${p.name}, ${p.description}, ${p.price.toString()}, ${p.sku},
            ${p.trackInventory}, ${p.stock}, ${p.status}) RETURNING id`)
  await audit(ctx, m.workspace.id, 'product.created', { type: 'product', id: r[0]!.id }, { name: p.name })
  return { id: r[0]!.id }
}

export async function updateProduct(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.manage')
  const id = ctx.params.pid ?? ''
  if (!isUuid(id)) throw notFound('Product not found.')
  const p = await parseProduct(m, asBody(await ctx.body()))
  const done = await rows<{ id: string }>(sql`
    UPDATE products SET category_id = ${p.categoryId}, name = ${p.name}, description = ${p.description},
      price_units = ${p.price.toString()}, sku = ${p.sku}, track_inventory = ${p.trackInventory}, stock = ${p.stock},
      status = ${p.status}, updated_at = now()
    WHERE id = ${id} AND workspace_id = ${m.workspace.id} RETURNING id`)
  if (!done[0]) throw notFound('Product not found.')
  await audit(ctx, m.workspace.id, 'product.updated', { type: 'product', id })
  return { ok: true }
}

export async function archiveProduct(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.manage')
  const id = ctx.params.pid ?? ''
  if (!isUuid(id)) throw notFound('Product not found.')
  await sql`UPDATE products SET status = 'archived', updated_at = now() WHERE id = ${id} AND workspace_id = ${m.workspace.id}`
  await audit(ctx, m.workspace.id, 'product.archived', { type: 'product', id })
  return { ok: true }
}

// ---------- images ----------
function sniffImage(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  const riff = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return riff ? 'image/webp' : null
}

export async function uploadImage(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.manage')
  const pid = ctx.params.pid ?? ''
  if (!isUuid(pid)) throw notFound('Product not found.')
  const owned = await rows<{ id: string }>(sql`SELECT id FROM products WHERE id = ${pid} AND workspace_id = ${m.workspace.id}`)
  if (!owned[0]) throw notFound('Product not found.')
  const count = await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM product_images WHERE product_id = ${pid}`)
  if ((count[0]?.n ?? 0) >= MAX_IMAGES) throw conflict(`A product can have up to ${MAX_IMAGES} images.`)
  const bytes = new Uint8Array(await ctx.req.arrayBuffer())
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw badRequest('Images must be under 1.5 MB.')
  const type = sniffImage(bytes)
  if (!type) throw badRequest('Only JPEG, PNG or WebP images are supported.')
  const r = await rows<{ id: string }>(sql`
    INSERT INTO product_images (product_id, workspace_id, content_type, data, position)
    VALUES (${pid}, ${m.workspace.id}, ${type}, ${Buffer.from(bytes)}, ${count[0]?.n ?? 0}) RETURNING id`)
  return { id: r[0]!.id }
}

export async function deleteImage(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.manage')
  const iid = ctx.params.iid ?? ''
  if (!isUuid(iid)) throw notFound()
  await sql`DELETE FROM product_images WHERE id = ${iid} AND workspace_id = ${m.workspace.id}`
  return { ok: true }
}

/** Public. Image ids are unguessable; only raster types are ever stored, and nosniff is set. */
export async function serveImage(ctx: Ctx) {
  const id = ctx.params.iid ?? ''
  if (!isUuid(id)) throw notFound()
  const found = await rows<{ content_type: string; data: Uint8Array }>(sql`SELECT content_type, data FROM product_images WHERE id = ${id}`)
  if (!found[0]) throw notFound()
  return new Response(found[0].data, {
    headers: { 'Content-Type': found[0].content_type, 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}

// ---------- storefront ----------
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface StorefrontRow {
  slug: string
  title: string
  tagline: string
  description: string
  published: boolean
}

export async function getStorefront(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.view')
  let found = await rows<StorefrontRow>(sql`SELECT slug, title, tagline, description, published FROM storefronts WHERE workspace_id = ${m.workspace.id}`)
  if (!found[0]) {
    await sql`
      INSERT INTO storefronts (workspace_id, slug, title) VALUES (${m.workspace.id}, ${m.workspace.slug}, ${m.workspace.name})
      ON CONFLICT DO NOTHING`
    found = await rows<StorefrontRow>(sql`SELECT slug, title, tagline, description, published FROM storefronts WHERE workspace_id = ${m.workspace.id}`)
  }
  const s = found[0]!
  return { storefront: { slug: s.slug, title: s.title, tagline: s.tagline, description: s.description, published: s.published } }
}

export async function updateStorefront(ctx: Ctx) {
  const m = await requireMember(ctx, 'storefront.manage')
  const body = asBody(await ctx.body())
  const slug = str(body, 'slug', { min: 3, max: 40 }).toLowerCase()
  if (!SLUG_RE.test(slug)) throw badRequest('The web address can use lowercase letters, numbers and single hyphens.')
  if (['api', 'app', 'admin', 'signin', 'signup', 'invite', 'docs', 'pricing', 'features', 'contact'].includes(slug)) throw badRequest('That web address is reserved.')
  const title = str(body, 'title', { min: 2, max: 80 })
  const tagline = str(body, 'tagline', { max: 140, optional: true })
  const description = str(body, 'description', { max: 2000, optional: true })
  const published = bool(body, 'published')
  try {
    await sql`
      INSERT INTO storefronts (workspace_id, slug, title, tagline, description, published)
      VALUES (${m.workspace.id}, ${slug}, ${title}, ${tagline}, ${description}, ${published})
      ON CONFLICT (workspace_id) DO UPDATE SET slug = ${slug}, title = ${title}, tagline = ${tagline},
        description = ${description}, published = ${published}, updated_at = now()`
  } catch {
    throw conflict('That web address is already taken. Try another.')
  }
  await audit(ctx, m.workspace.id, published ? 'storefront.published' : 'storefront.saved', { type: 'storefront', id: slug })
  return { ok: true }
}

// ---------- discounts ----------
interface DiscountRow {
  id: string
  code: string
  kind: string
  value: unknown
  min_subtotal_units: unknown
  max_uses: number | null
  used_count: number
  starts_at: Date | null
  ends_at: Date | null
  active: boolean
}

const discountDto = (d: DiscountRow) => ({
  id: d.id,
  code: d.code,
  kind: d.kind,
  value: d.kind === 'percent' ? String(big(d.value)) : usd(d.value),
  minSubtotal: usd(d.min_subtotal_units),
  maxUses: d.max_uses,
  usedCount: d.used_count,
  startsAt: d.starts_at,
  endsAt: d.ends_at,
  active: d.active,
})

export async function listDiscounts(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.view')
  const list = await rows<DiscountRow>(sql`SELECT * FROM discounts WHERE workspace_id = ${m.workspace.id} ORDER BY created_at DESC`)
  return { discounts: list.map(discountDto) }
}

function dateOrNull(body: Record<string, unknown>, key: string): Date | null {
  const v = str(body, key, { max: 40, optional: true })
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw badRequest(`${key} is not a valid date.`)
  return d
}

export async function createDiscount(ctx: Ctx) {
  const m = await requireMember(ctx, 'discounts.manage')
  const body = asBody(await ctx.body())
  const code = str(body, 'code', { min: 3, max: 30 }).toUpperCase()
  if (!/^[A-Z0-9_-]+$/.test(code)) throw badRequest('Codes can use letters, numbers, hyphens and underscores.')
  const kind = oneOf(body, 'kind', ['percent', 'fixed'] as const)
  let value: bigint
  if (kind === 'percent') {
    value = BigInt(int(body, 'value', { min: 1, max: 100 }) ?? 1)
  } else {
    value = parsePrice(body.value, 'Discount amount')
  }
  const minSubtotal = body.minSubtotal ? parsePrice(body.minSubtotal, 'Minimum order', { allowZero: true }) : 0n
  const maxUses = int(body, 'maxUses', { min: 1, max: 1_000_000, optional: true })
  const startsAt = dateOrNull(body, 'startsAt')
  const endsAt = dateOrNull(body, 'endsAt')
  if (startsAt && endsAt && endsAt <= startsAt) throw badRequest('The end date must be after the start date.')
  try {
    const r = await rows<{ id: string }>(sql`
      INSERT INTO discounts (workspace_id, code, kind, value, min_subtotal_units, max_uses, starts_at, ends_at)
      VALUES (${m.workspace.id}, ${code}, ${kind}, ${value.toString()}, ${minSubtotal.toString()}, ${maxUses}, ${startsAt}, ${endsAt})
      RETURNING id`)
    await audit(ctx, m.workspace.id, 'discount.created', { type: 'discount', id: r[0]!.id }, { code })
    return { id: r[0]!.id }
  } catch {
    throw conflict('A discount with that code already exists.')
  }
}

export async function setDiscountActive(ctx: Ctx) {
  const m = await requireMember(ctx, 'discounts.manage')
  const id = ctx.params.did ?? ''
  if (!isUuid(id)) throw notFound()
  const active = bool(asBody(await ctx.body()), 'active')
  await sql`UPDATE discounts SET active = ${active} WHERE id = ${id} AND workspace_id = ${m.workspace.id}`
  return { ok: true }
}

export async function deleteDiscount(ctx: Ctx) {
  const m = await requireMember(ctx, 'discounts.manage')
  const id = ctx.params.did ?? ''
  if (!isUuid(id)) throw notFound()
  await sql`DELETE FROM discounts WHERE id = ${id} AND workspace_id = ${m.workspace.id}`
  return { ok: true }
}
