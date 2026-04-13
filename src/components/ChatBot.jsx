import { useState, useRef, useEffect } from 'react'

export default function ChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '안녕하세요! ASSI 기능에 대해 궁금한 점을 물어보세요.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      // system 메시지 제외하고 user/assistant만 보냄
      const apiMessages = newMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(1) // 첫 인사 메시지 제외
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '죄송합니다, 잠시 후 다시 시도해주세요.' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '네트워크 오류가 발생했어요. 다시 시도해주세요.' }])
    }
    setLoading(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 w-12 h-12 md:w-14 md:h-14 bg-white rounded-full shadow-lg shadow-gray-300/50 border border-orange-200 flex items-center justify-center hover:shadow-xl hover:border-[#F4A259] transition-all hover:scale-105 active:scale-95"
        aria-label="챗봇 열기"
      >
        <img src="/logo/eyes.png" alt="ASSI 도우미" className="w-8 h-8 object-contain" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 w-[360px] max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-2xl shadow-gray-300/50 border border-gray-200 flex flex-col overflow-hidden" style={{ height: '500px', maxHeight: 'calc(100vh - 160px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#F4A259] text-white flex-shrink-0">
        <img src="/logo/eyes.png" alt="" className="w-7 h-7 object-contain" />
        <div className="flex-1">
          <div className="text-sm font-bold">ASSI 도우미</div>
          <div className="text-[10px] opacity-80">기능 안내 챗봇</div>
        </div>
        <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ fontFamily: "'Pretendard', -apple-system, sans-serif" }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                <img src="/logo/eyes.png" alt="" className="w-4 h-4 object-contain" />
              </div>
            )}
            <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-[#F4A259] text-white rounded-br-md'
                : 'bg-gray-100 text-gray-700 rounded-bl-md'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
              <img src="/logo/eyes.png" alt="" className="w-4 h-4 object-contain" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-100 p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="기능에 대해 물어보세요..."
            className="flex-1 px-4 py-2.5 bg-gray-50 rounded-full text-sm outline-none focus:bg-gray-100 transition-colors placeholder:text-gray-300"
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="w-10 h-10 bg-[#F4A259] rounded-full flex items-center justify-center text-white hover:bg-[#E8923A] transition-colors disabled:opacity-30 disabled:hover:bg-[#F4A259] flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
