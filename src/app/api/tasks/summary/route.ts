import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth/client-auth';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import { normalizeFeatures } from '@/lib/features';

type SummaryBody = {
  startDate?: string | null;
  endDate?: string | null;
};

const MODEL = 'gpt-4o-mini';

export async function POST(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: SummaryBody = {};
  try {
    body = (await req.json()) as SummaryBody;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const startDate = body.startDate ? new Date(body.startDate) : null;
  const endDate = body.endDate ? new Date(body.endDate) : null;

  let service;
  try {
    service = getServiceRoleClient();
  } catch (error) {
    console.error('[tasks/summary] missing service role', error);
    return NextResponse.json({ error: 'Supabase service role not configured.' }, { status: 500 });
  }

  // Enforce feature access
  const { data: settingsRow } = await service
    .from('profile_settings')
    .select('features')
    .eq('user_id', user.id)
    .maybeSingle();
  const features = normalizeFeatures(settingsRow);
  if (!features.includes('ai_summary')) {
    return NextResponse.json({ error: 'AI summary not enabled for this account.' }, { status: 403 });
  }

  let query = service
    .from('tasks')
    .select('title, description, completed, updated_at')
    .eq('created_by', user.id)
    .eq('completed', true)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (startDate && !Number.isNaN(startDate.getTime())) {
    query = query.gte('updated_at', startDate.toISOString());
  }
  if (endDate && !Number.isNaN(endDate.getTime())) {
    const endIso = new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
    query = query.lte('updated_at', endIso);
  }

  const { data: tasks, error: tasksError } = await query;
  if (tasksError) {
    console.error('[tasks/summary] task fetch failed', tasksError);
    return NextResponse.json({ error: 'Unable to load tasks.' }, { status: 500 });
  }

  const safeTasks = (tasks ?? []).map((task) => ({
    title: task.title ?? 'Untitled task',
    description: task.description ?? '',
    updated_at: task.updated_at ?? null,
  }));

  if (!safeTasks.length) {
    return NextResponse.json({ summary: 'No completed tasks found for the selected range.' });
  }

  const prompt = [
    'Summarize the following completed tasks into a concise, professional review-ready paragraph and bullet list.',
    'Focus on outcomes, impact, and themes. Keep it friendly but business-ready.',
    'Return under 250 words.',
    '',
    JSON.stringify(
      safeTasks.map((task) => ({
        title: task.title,
        description: task.description,
        completedAt: task.updated_at,
      })),
    ),
  ].join('\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = safeTasks
      .slice(0, 10)
      .map((task) => `• ${task.title}${task.description ? ` — ${task.description}` : ''}`)
      .join('\n');
    return NextResponse.json({
      summary: `Summary (offline fallback):\n${fallback}`,
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are an assistant that crafts succinct performance-review style summaries. Highlight impact and outcomes.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!response.ok) {
      const message = payload?.error?.message ?? 'OpenAI request failed.';
      throw new Error(message);
    }
    const content = payload.choices?.[0]?.message?.content?.trim();
    return NextResponse.json({ summary: content || 'Summary unavailable.' });
  } catch (error) {
    console.error('[tasks/summary] OpenAI call failed', error);
    const fallback = safeTasks
      .slice(0, 10)
      .map((task) => `• ${task.title}${task.description ? ` — ${task.description}` : ''}`)
      .join('\n');
    return NextResponse.json(
      {
        summary: `Summary (fallback):\n${fallback}`,
        error: error instanceof Error ? error.message : 'Unable to call OpenAI.',
      },
      { status: 200 },
    );
  }
}
