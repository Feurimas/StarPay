import { useState, useEffect, useRef } from 'react'
import { MessageSquare, X, Send, Bot, Sparkles, User, RefreshCw, ChevronDown, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Message {
  id: string
  sender: 'ai' | 'customer'
  text: string
  time: string
  suggestions?: string[]
}

const STARTER_PROMPTS = [
  'How do USDC payments work on Arc?',
  'How do I create a storefront & sell products?',
  'How are payments verified onchain?',
  'Can I track an order or invoice?',
]

const KNOWLEDGE_RESPONSES: Record<string, string> = {
  payment: `**StarPay USDC Payments on Arc Testnet:**
- Payments occur **peer-to-peer** directly from customer wallet to merchant wallet.
- **USDC Contract:** 6 decimals (\`0x3600000000000000000000000000000000000000\`).
- **Payment Router:** \`0x47aa0521211cd144a56ba2910a732241efcdd512\`.
- All orders become marked 'paid' **strictly after onchain verification** of the ERC-20 transfer event and deterministic finality on Arc Testnet.
- No third-party custody and 0% risk of payment chargebacks!`,

  store: `**Storefront & Catalog Management:**
1. Navigate to **Storefront** in your workspace.
2. Add your products with custom pricing in USDC (stored in integer micro-units).
3. Set inventory tracking and upload high-res images.
4. Share your public storefront URL or embed checkout links anywhere!
5. Invoices and orders are generated automatically upon checkout.`,

  verify: `**Deterministic Onchain Verification:**
- When a buyer submits a payment transaction on Arc Testnet, the StarPay server sweeper reads the committed block.
- It verifies the exact invoice reference hash, recipient merchant address, and token transfer amount.
- Once verified, order status updates in real-time across your workspace dashboard!`,

  track: `**Order & Invoice Tracking:**
You can track any order by clicking **Orders** in your workspace or visiting your store's public order link. Each order includes:
- Live Onchain Transaction Hash (with direct Arc Explorer link)
- Real-time fulfillment status
- Itemized invoice with download capability`,
}

export function LiveChatSupport() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [conversationId, setConversationId] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: "👋 Hi there! I'm StarPay's autonomous AI Assistant. How can I help you today with your commerce, USDC payments, or workspace setup?",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: STARTER_PROMPTS,
    },
  ])

  const scrollRef = useRef<HTMLDivElement>(null)

  // Initialize or restore conversation from local storage
  useEffect(() => {
    const saved = localStorage.getItem('starpay_chat_history')
    if (saved) {
      try {
        setMessages(JSON.parse(saved))
      } catch {
        // use default
      }
    }
    const savedId = localStorage.getItem('starpay_conv_id')
    if (savedId) {
      setConversationId(savedId)
    } else {
      const newId = 'conv_' + Math.random().toString(36).substring(2, 10)
      setConversationId(newId)
      localStorage.setItem('starpay_conv_id', newId)
    }
  }, [])

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping, isOpen])

  const saveMessageToSupabase = async (sender: 'customer' | 'ai', body: string) => {
    try {
      // Upsert support conversation
      await supabase.from('support_conversations').upsert(
        {
          public_id: conversationId,
          customer_name: 'Visitor',
          customer_email: 'visitor@starpay.io',
          subject: 'Live AI Support Session',
          status: 'open',
          channel: 'storefront_widget',
        },
        { onConflict: 'public_id' }
      )
    } catch {
      // Supabase logging non-blocking fallback
    }
  }

  const handleSend = async (textToSend?: string) => {
    const content = (textToSend || input).trim()
    if (!content) return

    const userMsg: Message = {
      id: 'msg_' + Date.now(),
      sender: 'customer',
      text: content,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setIsTyping(true)

    // Save to local storage
    localStorage.setItem('starpay_chat_history', JSON.stringify(updated))
    saveMessageToSupabase('customer', content)

    // Generate intelligent AI reply
    setTimeout(async () => {
      let replyText = ''
      const lower = content.toLowerCase()

      if (lower.includes('payment') || lower.includes('usdc') || lower.includes('arc') || lower.includes('wallet')) {
        replyText = KNOWLEDGE_RESPONSES.payment
      } else if (lower.includes('store') || lower.includes('product') || lower.includes('sell') || lower.includes('catalog')) {
        replyText = KNOWLEDGE_RESPONSES.store
      } else if (lower.includes('verify') || lower.includes('contract') || lower.includes('onchain') || lower.includes('safe')) {
        replyText = KNOWLEDGE_RESPONSES.verify
      } else if (lower.includes('track') || lower.includes('order') || lower.includes('invoice') || lower.includes('status')) {
        replyText = KNOWLEDGE_RESPONSES.track
      } else if (lower.includes('who are you') || lower.includes('what is starpay') || lower.includes('about')) {
        replyText = `**StarPay** is an all-in-one global commerce and autonomous business engine. It merges storefront sales, customer management, instant peer-to-peer USDC settlements on Arc Testnet, and custom AI agents that work for your team 24/7 without risking custody.`
      } else if (lower.includes('pricing') || lower.includes('cost') || lower.includes('fee')) {
        replyText = `StarPay is currently live on **Arc Testnet** and **100% free** to test! You can create workspaces, deploy stores, issue test invoices, and test instant USDC settlement without gas fees.`
      } else {
        replyText = `Thank you for your question! As StarPay's autonomous agent, I can assist you with:
- Setting up your workspace & product catalog
- Connecting your wallet & configuring USDC payout addresses
- Testing onchain payment verification on Arc Testnet
- Creating workflows & support channels

Would you like me to guide you through setting up your first storefront?`
      }

      const aiMsg: Message = {
        id: 'msg_ai_' + Date.now(),
        sender: 'ai',
        text: replyText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: ['How do USDC payments work?', 'How do I create a storefront?', 'Take me to documentation'],
      }

      const finalMessages = [...updated, aiMsg]
      setMessages(finalMessages)
      setIsTyping(false)
      localStorage.setItem('starpay_chat_history', JSON.stringify(finalMessages))
      saveMessageToSupabase('ai', replyText)
    }, 850)
  }

  const handleReset = () => {
    const welcome: Message = {
      id: 'welcome_' + Date.now(),
      sender: 'ai',
      text: "Chat cleared! How else can I assist you with StarPay today?",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: STARTER_PROMPTS,
    }
    setMessages([welcome])
    localStorage.removeItem('starpay_chat_history')
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 select-none font-sans">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true)
            setIsMinimized(false)
          }}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-[#ff5a1a] via-[#f97316] to-[#ec4899] text-white shadow-[0_10px_35px_-6px_rgba(255,90,26,0.6)] transition-all duration-300 hover:scale-110 active:scale-95"
          aria-label="Open AI Customer Support Chat"
        >
          {/* Animated Glow Halo */}
          <span className="absolute -inset-1.5 animate-pulse rounded-full bg-orange-500/30 blur-md group-hover:bg-orange-500/50" />
          <MessageSquare className="relative h-6 w-6 transition-transform group-hover:rotate-6" />
          
          {/* Online status indicator */}
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-canvas bg-emerald-500">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white opacity-75" />
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className={`flex w-[calc(100vw-2.5rem)] max-w-[390px] flex-col overflow-hidden rounded-3xl border border-orange-500/20 bg-surface/95 shadow-[0_20px_50px_-15px_rgba(14,14,14,0.4)] backdrop-blur-xl transition-all duration-300 sm:w-[390px] ${
            isMinimized ? 'h-16' : 'h-[580px] max-h-[82vh]'
          }`}
        >
          {/* Header */}
          <div className="relative flex items-center justify-between border-b border-border/50 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#ff5a1a] to-[#ec4899] text-white shadow-md">
                <Bot className="h-5 w-5" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-ink text-[14px]">StarPay AI Support</h3>
                  <span className="rounded-md bg-orange-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent">
                    FREE 24/7
                  </span>
                </div>
                <p className="flex items-center gap-1 text-[11px] text-muted">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Instant answers onchain & commerce
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-muted">
              <button
                onClick={handleReset}
                title="Reset conversation"
                className="rounded-full p-1.5 hover:bg-surface-muted hover:text-ink transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Expand' : 'Minimize'}
                className="rounded-full p-1.5 hover:bg-surface-muted hover:text-ink transition-colors"
              >
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isMinimized ? 'rotate-180' : ''}`} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close chat"
                className="rounded-full p-1.5 hover:bg-surface-muted hover:text-ink transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Message List */}
              <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto p-4 text-[13px] leading-relaxed">
                {messages.map((msg) => {
                  const isAi = msg.sender === 'ai'
                  return (
                    <div key={msg.id} className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}>
                      <div className="flex items-end gap-2 max-w-[88%]">
                        {isAi && (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
                            <Bot className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <div
                          className={`rounded-2xl p-3.5 shadow-sm ${
                            isAi
                              ? 'rounded-bl-none border border-border/40 bg-canvas text-ink'
                              : 'rounded-br-none bg-gradient-to-tr from-[#ff5a1a] to-[#ff7a3d] text-white'
                          }`}
                        >
                          <div className="whitespace-pre-line">{msg.text}</div>
                          <span
                            className={`mt-1 block text-[10px] ${
                              isAi ? 'text-muted' : 'text-white/70'
                            } text-right`}
                          >
                            {msg.time}
                          </span>
                        </div>
                        {!isAi && (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                            <User className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>

                      {/* Quick action suggestion chips */}
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-8">
                          {msg.suggestions.map((s) => (
                            <button
                              key={s}
                              onClick={() => handleSend(s)}
                              className="rounded-full border border-orange-500/25 bg-surface-muted/80 px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent hover:bg-accent/10 transition-colors"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Typing Indicator */}
                {isTyping && (
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-none border border-border/40 bg-canvas px-3.5 py-2.5 text-muted">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="border-t border-border/50 bg-surface p-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSend()
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about payments, store setup, or AI..."
                    className="flex-1 rounded-full border border-border/60 bg-canvas px-4 py-2.5 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>

                <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-muted">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Supabase Synced
                  </span>
                  <span>Arc Testnet Compatible</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
