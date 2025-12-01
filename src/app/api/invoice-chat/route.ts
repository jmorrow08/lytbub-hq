import { NextRequest, NextResponse } from 'next/server';
import { buildInvoiceSystemPrompt, fetchPublicInvoice } from '@/lib/invoice-portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json().catch(() => null)) as
      | { shareId?: string; messages?: ChatMessage[] }
      | null;

    if (!payload || !payload.shareId || !Array.isArray(payload.messages)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const messages = payload.messages as ChatMessage[];
    const invoice = await fetchPublicInvoice(payload.shareId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const systemPrompt = buildInvoiceSystemPrompt(invoice);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        reply:
          'The AI assistant is temporarily unavailable. Please email us if you need anything clarified about this invoice.',
        offline: true,
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 350,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok) {
      console.error('[api/invoice-chat] OpenAI response error', await response.text());
      return NextResponse.json(
        {
          reply:
            'I could not reach the AI assistant just now. Please try again in a moment or contact support.',
        },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const reply =
      data.choices?.[0]?.message?.content ??
      'I was not able to generate a response. Please try again.';

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('[api/invoice-chat] unexpected error', error);
    return NextResponse.json(
      { reply: 'Something went wrong. Please try again later.' },
      { status: 500 },
    );
  }
}
