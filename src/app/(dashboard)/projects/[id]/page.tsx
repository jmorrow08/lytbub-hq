'use client';
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  getProject,
  getProjectStats,
  getTasks,
  getContent,
  createProjectChannel,
  updateProjectChannel,
  deleteProjectChannel,
  updateTask,
} from '@/lib/api';
import type {
  ProjectWithChannels,
  ProjectStats,
  Task,
  Content,
  ProjectChannel,
  CreateProjectChannelData,
} from '@/types';
import { ArrowLeft, CheckSquare, Eye, Pencil, Trash2 } from 'lucide-react';

const channelPlatforms = [
  'youtube',
  'instagram',
  'tiktok',
  'twitter',
  'linkedin',
  'website',
  'podcast',
  'newsletter',
  'other',
] as const;

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params?.id as string | undefined;

  const [project, setProject] = useState<ProjectWithChannels | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelSubmitting, setChannelSubmitting] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ProjectChannel | null>(null);
  const [channelForm, setChannelForm] = useState({
    platform: 'instagram',
    handle: '',
    url: '',
    is_primary: false,
    notes: '',
  });

  const refreshProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [projectData, statsData, taskData, contentData] = await Promise.all([
        getProject(projectId),
        getProjectStats(),
        getTasks({ projectId, limit: 200 }),
        getContent({ projectId, limit: 200 }),
      ]);
      setProject(projectData);
      const stat = statsData.find((item) => item.project_id === projectId) || null;
      setStats(stat);
      setTasks(taskData);
      setContent(contentData);
    } catch (error) {
      console.error('Error loading project detail:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    refreshProject();
  }, [projectId, refreshProject]);

  const projectChannels = project?.channels || [];

  const handleChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setChannelSubmitting(true);
    const payload: CreateProjectChannelData = {
      project_id: projectId,
      platform: channelForm.platform as CreateProjectChannelData['platform'],
      handle: channelForm.handle || undefined,
      url: channelForm.url || undefined,
      is_primary: channelForm.is_primary,
      notes: channelForm.notes || undefined,
    };
    try {
      if (editingChannel) {
        await updateProjectChannel(editingChannel.id, payload);
      } else {
        await createProjectChannel(payload);
      }
      setChannelForm({
        platform: 'instagram',
        handle: '',
        url: '',
        is_primary: false,
        notes: '',
      });
      setEditingChannel(null);
      refreshProject();
    } catch (error) {
      console.error('Error saving channel:', error);
    } finally {
      setChannelSubmitting(false);
    }
  };

  const startEditingChannel = (channel: ProjectChannel) => {
    setEditingChannel(channel);
    setChannelForm({
      platform: channel.platform,
      handle: channel.handle || '',
      url: channel.url || '',
      is_primary: channel.is_primary,
      notes: channel.notes || '',
    });
  };

  const resetChannelForm = () => {
    setEditingChannel(null);
    setChannelForm({
      platform: 'instagram',
      handle: '',
      url: '',
      is_primary: false,
      notes: '',
    });
  };

  const handleDeleteChannel = async (channel: ProjectChannel) => {
    const confirmed = window.confirm(`Remove channel ${channel.platform}?`);
    if (!confirmed) return;
    try {
      await deleteProjectChannel(channel.id);
      refreshProject();
    } catch (error) {
      console.error('Error deleting channel:', error);
    }
  };

  const handleToggleTask = async (task: Task) => {
    try {
      await updateTask(task.id, { completed: !task.completed });
      refreshProject();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const totalViews = useMemo(
    () => content.reduce((sum, item) => sum + item.views, 0),
    [content]
  );

  if (!projectId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/projects')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/projects')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Button variant="ghost" className="px-0 text-sm" onClick={() => router.push('/projects')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Projects
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: project.color || '#6366f1' }}
            />
            <h1 className="text-3xl font-bold">{project.name}</h1>
          </div>
          <p className="text-muted-foreground">
            {project.type.replace('_', ' ')} • {project.status}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Open Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.open_tasks ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Completed Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.completed_tasks ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Content Pieces</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.content_count ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Views</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalViews.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Channels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {projectChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No channels added yet.</p>
            ) : (
              <div className="space-y-3">
                {projectChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium capitalize">
                        {channel.platform}
                        {channel.is_primary && (
                          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            Primary
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {channel.handle || 'No handle'}{' '}
                        {channel.url && (
                          <a
                            className="ml-2 underline"
                            href={channel.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Visit
                          </a>
                        )}
                      </p>
                      {channel.notes && (
                        <p className="text-xs text-muted-foreground">{channel.notes}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => startEditingChannel(channel)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => handleDeleteChannel(channel)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleChannelSubmit} className="space-y-3 border-t pt-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Platform</label>
                  <select
                    value={channelForm.platform}
                    onChange={(e) =>
                      setChannelForm((prev) => ({ ...prev, platform: e.target.value }))
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent capitalize"
                  >
                    {channelPlatforms.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Handle</label>
                  <Input
                    value={channelForm.handle}
                    onChange={(e) =>
                      setChannelForm((prev) => ({ ...prev, handle: e.target.value }))
                    }
                    placeholder="@handle"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">URL</label>
                <Input
                  value={channelForm.url}
                  onChange={(e) => setChannelForm((prev) => ({ ...prev, url: e.target.value }))}
                  placeholder="https://"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={channelForm.notes}
                  onChange={(e) => setChannelForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  rows={2}
                />
              </div>
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={channelForm.is_primary}
                  onChange={(e) =>
                    setChannelForm((prev) => ({ ...prev, is_primary: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-input"
                />
                <span>Primary channel</span>
              </label>
              <div className="flex space-x-2">
                <Button type="submit" disabled={channelSubmitting}>
                  {channelSubmitting
                    ? 'Saving...'
                    : editingChannel
                      ? 'Update Channel'
                      : 'Add Channel'}
                </Button>
                {editingChannel && (
                  <Button type="button" variant="outline" onClick={resetChannelForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {project.notes ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{project.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes added.</p>
            )}
            {project.default_platform && (
              <div className="mt-4 rounded-md border p-3 text-sm">
                <p className="font-medium">Primary Platform</p>
                <p className="text-muted-foreground">
                  {project.default_platform}{' '}
                  {project.default_handle && <span>• {project.default_handle}</span>}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckSquare className="h-5 w-5 text-yellow-500" />
              <span>Tasks</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks yet.</p>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-center space-x-3 rounded border p-3">
                    <button
                      onClick={() => handleToggleTask(task)}
                      className={`h-5 w-5 rounded border-2 ${
                        task.completed
                          ? 'border-green-500 bg-green-500'
                          : 'border-yellow-500'
                      } flex items-center justify-center`}
                    >
                      {task.completed && <CheckSquare className="h-3 w-3 text-white" />}
                    </button>
                    <div className="flex-1">
                      <p className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Eye className="h-5 w-5 text-blue-500" />
              <span>Content</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {content.length === 0 ? (
              <p className="text-sm text-muted-foreground">No content logged.</p>
            ) : (
              <div className="space-y-3">
                {content.map((item) => (
                  <div key={item.id} className="rounded border p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{item.title}</p>
                      <span className="text-sm text-muted-foreground">{item.platform}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {item.views.toLocaleString()} views
                      {item.published_at && (
                        <span className="ml-2">
                          • {new Date(item.published_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline"
                      >
                        View content
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
