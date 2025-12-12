'use client';
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getProjects,
  upsertPerformanceMetrics,
  createFocusLog,
} from '@/lib/api';
import type { Task, CreateTaskData, ProjectWithChannels } from '@/types';
import { useFocusMode } from '@/components/mode/FocusModeProvider';
import { TaskCompletionModal, type CompletionDetails } from '@/components/tasks/TaskCompletionModal';
import { CheckSquare, Plus, Trash2, Edit } from 'lucide-react';
import { useUserFeatures } from '@/components/features/UserFeaturesProvider';
import { supabase } from '@/lib/supabaseClient';

export default function TasksPage() {
  const { focusMode } = useFocusMode();
  const { features, loading: featuresLoading } = useUserFeatures();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({ title: '', description: '', project_id: '' });
  const [projects, setProjects] = useState<ProjectWithChannels[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [completionTask, setCompletionTask] = useState<Task | null>(null);
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryStart, setSummaryStart] = useState('');
  const [summaryEnd, setSummaryEnd] = useState('');
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTasks({
        limit: 200,
        projectId: projectFilter !== 'all' && projectFilter !== 'unassigned' ? projectFilter : undefined,
        unassigned: projectFilter === 'unassigned',
      });
      setTasks(data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  useEffect(() => {
    const shouldLoadProjects = features.includes('admin');
    if (!shouldLoadProjects) return;
    fetchProjects();
  }, [features, fetchProjects]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!showSummary) {
      setSummaryText(null);
      setSummaryError(null);
      setSummarizing(false);
    }
  }, [showSummary]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    try {
      if (editingTask) {
        await updateTask(editingTask.id, {
          title: formData.title,
          description: formData.description,
          project_id: formData.project_id ? formData.project_id : null,
        });
      } else {
        const payload: CreateTaskData = {
          title: formData.title,
          description: formData.description || undefined,
        };

        if (formData.project_id) {
          payload.project_id = formData.project_id;
        }

        await createTask(payload);
      }

      setFormData({ title: '', description: '', project_id: '' });
      setShowForm(false);
      setEditingTask(null);
      fetchTasks();
    } catch (error) {
      console.error('Error saving task:', error);
    }
  };

  const handleToggleComplete = async (task: Task) => {
    if (!task.completed) {
      setCompletionTask(task);
      return;
    }

    try {
      await updateTask(task.id, { completed: false });
      fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleCompletionSubmit = async (details: CompletionDetails) => {
    if (!completionTask) return;
    setSavingCompletion(true);
    try {
      await updateTask(completionTask.id, { completed: true, focus_mode: focusMode });

      if (details.mode === 'CORPORATE') {
        await upsertPerformanceMetrics(completionTask.id, {
          financial_impact: details.financialImpact,
          skill_demonstrated: details.skillDemonstrated,
          kudos_received: details.kudosReceived,
        });
      } else {
        await createFocusLog({
          task_id: completionTask.id,
          mode: 'HOLISTIC',
          interruption_reason: details.interruptionReason || null,
          ai_summary: details.feeling,
        });
      }

      fetchTasks();
      setCompletionTask(null);
    } catch (error) {
      console.error('Error saving completion details:', error);
    } finally {
      setSavingCompletion(false);
    }
  };

  const closeCompletionModal = () => setCompletionTask(null);

  const requestSummary = async () => {
    setSummarizing(true);
    setSummaryError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch('/api/tasks/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          startDate: summaryStart || null,
          endDate: summaryEnd || null,
        }),
      });
      const payload = (await response.json()) as { summary?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to generate summary.');
      }
      setSummaryText(payload.summary ?? 'No summary available.');
    } catch (error) {
      console.error('Summary failed', error);
      setSummaryError(error instanceof Error ? error.message : 'Unable to generate summary.');
    } finally {
      setSummarizing(false);
    }
  };

  const downloadSummaryPdf = () => {
    if (!summaryText) return;

    const encoder = new TextEncoder();
    const rangeLabel = summaryStart || summaryEnd
      ? `Covered range: ${summaryStart || 'start'} to ${summaryEnd || 'present'}`
      : 'Covered range: all completed tasks';

    const escapePdfText = (text: string) =>
      text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    const wrapText = (text: string, max = 94) => {
      const lines: string[] = [];
      const cleaned = text.replace(/\*\*/g, '').split(/\r?\n/);
      cleaned.forEach((paragraph) => {
        const trimmed = paragraph.trim();
        if (!trimmed) {
          lines.push('');
          return;
        }
        const words = trimmed.split(/\s+/);
        let current = '';
        words.forEach((word) => {
          if (!current.length) {
            current = word;
            return;
          }
          if (`${current} ${word}`.length <= max) {
            current = `${current} ${word}`;
          } else {
            lines.push(current);
            current = word;
          }
        });
        if (current) lines.push(current);
      });
      return lines;
    };

    const bodyLines = wrapText(summaryText);

    const contentLines = [
      'BT',
      '/F1 18 Tf',
      '1 0 0 1 64 760 Tm',
      '22 TL',
      `(${escapePdfText('Performance Review Summary')}) Tj`,
      'T*',
      '/F1 12 Tf',
      '16 TL',
      `(${escapePdfText(rangeLabel)}) Tj`,
      'T*',
      'T*',
      ...bodyLines.flatMap((line) => [`(${escapePdfText(line || ' ')}) Tj`, 'T*']),
      'ET',
    ].join('\n');

    const contentBytes = encoder.encode(contentLines);

    const pdfChunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let length = 0;

    const pushChunk = (text: string) => {
      const bytes = encoder.encode(text);
      pdfChunks.push(bytes);
      length += bytes.length;
    };

    const addObject = (obj: string) => {
      offsets.push(length);
      pushChunk(obj);
      pushChunk('\n');
    };

    pushChunk('%PDF-1.4\n');

    addObject('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
    addObject('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
    addObject(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    );
    addObject(
      `4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${contentLines}\nendstream\nendobj`,
    );
    addObject('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');

    const xrefStart = length;
    let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
    xref += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    xref += 'trailer\n';
    xref += `<< /Root 1 0 R /Size ${offsets.length + 1} >>\n`;
    xref += 'startxref\n';
    xref += `${xrefStart}\n`;
    xref += '%%EOF';

    pushChunk(xref);

    const pdfBytes = new Uint8Array(length);
    let position = 0;
    pdfChunks.forEach((chunk) => {
      pdfBytes.set(chunk, position);
      position += chunk.length;
    });

    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `task-summary-${Date.now()}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      await deleteTask(taskId);
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      project_id: task.project_id || '',
    });
    setShowForm(true);
  };

  const cancelEdit = () => {
    setEditingTask(null);
    setFormData({ title: '', description: '', project_id: '' });
    setShowForm(false);
  };

  const hasTasksFeature = features.includes('tasks');
  const hasAISummary = features.includes('ai_summary');
  const isSuperAdmin = features.includes('admin');

  const completedTasks = tasks.filter(task => task.completed);
  const pendingTasks = tasks.filter(task => !task.completed);

  if (featuresLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (!hasTasksFeature) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Tasks</h1>
        <Card>
          <CardHeader>
            <CardTitle>Access unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tasks are not enabled for this account. If you believe this is a mistake, contact your
            admin.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">Manage your tasks and track progress</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {isSuperAdmin && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            >
              <option value="all">All projects</option>
              <option value="unassigned">Unassigned</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          )}
          <Button onClick={() => setShowForm(true)} className="flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>Add Task</span>
          </Button>
          {hasAISummary && (
            <Button variant="outline" onClick={() => setShowSummary(true)}>
              Summarize
            </Button>
          )}
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingTask ? 'Edit Task' : 'Add New Task'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium mb-1">
                  Title *
                </label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter task title"
                  required
                />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter task description (optional)"
                  className="w-full px-3 py-2 border border-input bg-background rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  rows={3}
                />
              </div>
              {isSuperAdmin && (
                <div>
                  <label htmlFor="project" className="block text-sm font-medium mb-1">
                    Project
                  </label>
                  <select
                    id="project"
                    value={formData.project_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  >
                    <option value="">Unassigned</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex space-x-2">
                <Button type="submit">
                  {editingTask ? 'Update Task' : 'Add Task'}
                </Button>
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tasks Lists */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pending Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckSquare className="h-5 w-5 text-yellow-500" />
              <span>Pending Tasks ({pendingTasks.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">No pending tasks</p>
            ) : (
              <div className="space-y-3">
                {pendingTasks.map((task) => (
                  <div key={task.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <button
                      onClick={() => handleToggleComplete(task)}
                      className="w-5 h-5 border-2 border-yellow-500 rounded flex items-center justify-center hover:bg-yellow-500 hover:border-yellow-500 transition-colors"
                    >
                      {task.completed && <CheckSquare className="h-3 w-3 text-white" />}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{task.title}</h4>
                        {task.project ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                            style={{ backgroundColor: task.project.color || '#6366f1' }}
                          >
                            {task.project.name}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(task)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(task.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckSquare className="h-5 w-5 text-green-500" />
              <span>Completed Tasks ({completedTasks.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completedTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">No completed tasks</p>
            ) : (
              <div className="space-y-3">
                {completedTasks.map((task) => (
                  <div key={task.id} className="flex items-center space-x-3 p-3 border rounded-lg opacity-75">
                    <button
                      onClick={() => handleToggleComplete(task)}
                      className="w-5 h-5 bg-green-500 border-2 border-green-500 rounded flex items-center justify-center"
                    >
                      <CheckSquare className="h-3 w-3 text-white" />
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium line-through text-muted-foreground">
                          {task.title}
                        </h4>
                        {task.project ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                            style={{ backgroundColor: task.project.color || '#22c55e' }}
                          >
                            {task.project.name}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground line-through">{task.description}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(task.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TaskCompletionModal
        open={Boolean(completionTask)}
        mode={focusMode}
        taskTitle={completionTask?.title}
        loading={savingCompletion}
        onClose={closeCompletionModal}
        onSubmit={handleCompletionSubmit}
      />

      {showSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-xl rounded-lg bg-background shadow-2xl">
            <div className="flex items-start justify-between border-b px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">AI Summary</p>
                <h2 className="text-xl font-semibold">Summarize completed tasks</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose a date range or leave blank to include all completed tasks.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowSummary(false)}>
                Close
              </Button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Start date</label>
                  <Input
                    type="date"
                    value={summaryStart}
                    onChange={(e) => setSummaryStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">End date</label>
                  <Input
                    type="date"
                    value={summaryEnd}
                    onChange={(e) => setSummaryEnd(e.target.value)}
                  />
                </div>
              </div>
              {summaryError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {summaryError}
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                {summaryText && (
                  <Button variant="secondary" onClick={downloadSummaryPdf} disabled={!summaryText || summarizing}>
                    Download PDF
                  </Button>
                )}
                <Button variant="outline" onClick={() => setShowSummary(false)}>
                  Cancel
                </Button>
                <Button onClick={requestSummary} disabled={summarizing}>
                  {summarizing ? 'Summarizing…' : 'Generate summary'}
                </Button>
              </div>
              {summaryText && (
                <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
                  <p className="whitespace-pre-line">{summaryText}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
