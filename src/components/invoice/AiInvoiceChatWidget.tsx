"use client";

import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { PublicInvoiceView } from '@/lib/invoice-portal';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };

export function AiInvoiceChatWidget({ invoice }: { invoice: PublicInvoiceView }) {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hi, I’m Lytbub, your AI billing companion. Ask me anything about this invoice, usage fees, or the shadow/value section.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;
    const pending: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, pending]);
    setInput('');
    setIsSending(true);

    try {
      const res = await fetch('/api/invoice-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareId: invoice.shareId,
          messages: [
            ...messages.map(({ role, content }) => ({ role, content })),
            { role: 'user', content: pending.content },
          ],
        }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            data.reply ??
            data.error ??
            'I could not answer that just now. Please try again or email support.',
        },
      ]);
    } catch (error) {
      console.error('[AiInvoiceChatWidget] error', error);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            'I hit a snag reaching the AI assistant. Please try again in a moment or contact support.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {isOpen ? (
        <div className="w-80 max-w-[90vw] rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/80">
            <div>
              <div className="text-xs font-semibold text-slate-100">Ask Lytbub about this bill</div>
              <div className="text-[11px] text-slate-400">
                Private AI explainer for this invoice only.
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-full hover:bg-slate-800 text-slate-400"
              aria-label="Close invoice assistant"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="flex-1 flex flex-col p-3 gap-2 max-h-80 overflow-y-auto text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'self-end max-w-[85%] rounded-xl bg-emerald-500/10 border border-emerald-500/40 px-3 py-2'
                    : 'self-start max-w-[90%] rounded-xl bg-slate-900 border border-slate-800 px-3 py-2'
                }
              >
                {m.content}
              </div>
            ))}
            {isSending && (
              <div className="self-start text-[11px] text-slate-500">Lytbub is thinking…</div>
            )}
          </div>

          <div className="border-t border-slate-800 p-2 space-y-2">
            <Textarea
              rows={2}
              placeholder="Example: What is the shadow bill for?"
              className="resize-none text-xs bg-slate-950 border-slate-800"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <Button
              size="sm"
              className="w-full text-xs"
              onClick={sendMessage}
              disabled={isSending || !input.trim()}
            >
              {isSending ? 'Sending…' : 'Ask Lytbub'}
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="rounded-full bg-emerald-500 text-slate-950 shadow-xl flex items-center gap-2 px-4 py-2 text-xs font-semibold hover:bg-emerald-400"
        >
          <MessageCircle className="h-4 w-4" />
          Ask about this invoice
        </button>
      )}
    </div>
  );
}
