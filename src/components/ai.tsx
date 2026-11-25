import { Sparkles } from 'lucide-react'
import { Alert } from '@/components/ui'

/** Marks any text that a language model produced, so it is never mistaken for a verified record. */
export function AiLabel({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand ring-1 ring-[#f6c5a8] ${className}`} title="Written by an AI model. Not a verified payment or system record.">
      <Sparkles className="h-3 w-3" aria-hidden /> AI-generated
    </span>
  )
}

export function AiNotConfigured() {
  return (
    <Alert tone="warning">
      The AI provider is not connected yet. Add <code className="font-mono">AI_API_KEY</code> and <code className="font-mono">AI_MODEL</code> (and optionally <code className="font-mono">AI_BASE_URL</code> for any
      OpenAI-compatible provider) to <code className="font-mono">.env</code>, then restart the API server. Everything else on this page works without it.
    </Alert>
  )
}
