import { sql } from './db'
import { requestStore, sha256 } from './http'

export const EMAIL_MODE = process.env.EMAIL_MODE ?? 'dev'

interface Mail {
  to: string
  subject: string
  body: string
  /** In-app path (with the secret in the #fragment). The UI builds the full link at display time. */
  actionPath?: string
}

/**
 * No mail provider is connected yet. While EMAIL_MODE=dev, messages land in a development-only
 * mailbox that the app can display. When a real provider is added, replace this function and
 * set EMAIL_MODE to anything other than "dev" so the development mailbox is switched off.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (EMAIL_MODE !== 'dev') {
    throw new Error('No email provider is configured. Set one up before disabling EMAIL_MODE=dev.')
  }
  const key = requestStore.getStore()?.devKey
  await sql`
    INSERT INTO dev_outbox (to_email, subject, body, action_path, client_key)
    VALUES (${mail.to}, ${mail.subject}, ${mail.body}, ${mail.actionPath ?? null}, ${key ? sha256(key) : null})`
}
