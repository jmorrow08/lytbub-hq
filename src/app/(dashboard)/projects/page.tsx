'use client';
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getProjects,
  getProjectStats,
  getClients,
  createProject,
  updateProject,
  deleteProject,
} from '@/lib/api';
import type { ProjectWithChannels, ProjectStats, CreateProjectData, Client } from '@/types';
import { Plus, Edit, Trash2, FolderKanban, ExternalLink } from 'lucide-react';

const projectTypes = [
  { value: 'content_engine', label: 'Content Engine' },
  { value: 'client', label: 'Client' },
  { value: 'internal', label: 'Internal' },
  { value: 'experiment', label: 'Experiment' },
];

const projectStatuses = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithChannels[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStats[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithChannels | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slugLocked, setSlugLocked] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    type: 'content_engine',
    status: 'active',
    color: '#6366f1',
    default_platform: '',
    default_handle: '',
    notes: '',
    clientId: '',
  });

  const statsMap = useMemo(() => {
    const map = new Map<string, ProjectStats>();
    projectStats.forEach((stat) => map.set(stat.project_id, stat));
    return map;
  }, [projectStats]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const [projectData, statsData, clientData] = await Promise.all([
        getProjects(),
        getProjectStats(),
        getClients(),
      ]);
      setProjects(projectData);
      setProjectStats(statsData);
      setClients(clientData);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const resetForm = () => {
    setShowForm(false);
    setEditingProject(null);
    setSlugLocked(false);
    setFormData({
      name: '',
      slug: '',
      description: '',
      type: 'content_engine',
      status: 'active',
      color: '#6366f1',
      default_platform: '',
      default_handle: '',
      notes: '',
      clientId: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.slug.trim()) return;

    setSubmitting(true);
    const payload: CreateProjectData = {
      name: formData.name.trim(),
      slug: slugify(formData.slug),
      description: formData.description || undefined,
      type: formData.type as CreateProjectData['type'],
      status: formData.status as CreateProjectData['status'],
      color: formData.color,
      default_platform: formData.default_platform || undefined,
      default_handle: formData.default_handle || undefined,
      notes: formData.notes || undefined,
      client_id: formData.clientId || undefined,
    };

    try {
      if (editingProject) {
        await updateProject(editingProject.id, payload);
      } else {
        await createProject(payload);
      }
      resetForm();
      loadProjects();
    } catch (error) {
      console.error('Error saving project:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (project: ProjectWithChannels) => {
    setEditingProject(project);
    setSlugLocked(true);
    setShowForm(true);
    setFormData({
      name: project.name,
      slug: project.slug,
      description: project.description || '',
      type: project.type,
      status: project.status,
      color: project.color || '#6366f1',
      default_platform: project.default_platform || '',
      default_handle: project.default_handle || '',
      notes: project.notes || '',
      clientId: project.client_id || '',
    });
  };

  const handleDelete = async (project: ProjectWithChannels) => {
    const confirmed = window.confirm(
      `Delete project "${project.name}"? This will also remove any connected channels.`
    );
    if (!confirmed) return;

    try {
      await deleteProject(project.id);
      loadProjects();
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const projectsWithStats = projects.map((project) => {
    const stats = statsMap.get(project.id);
    return {
      ...project,
      stats: {
        openTasks: stats?.open_tasks || 0,
        completedTasks: stats?.completed_tasks || 0,
        contentCount: stats?.content_count || 0,
        totalViews: stats?.total_views || 0,
        lastPublishedAt: stats?.last_published_at || null,
      },
    };
  });

  const handleNameChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      name: value,
      slug: slugLocked ? prev.slug : slugify(value),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Organize tasks and content by project or niche.
          </p>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setSlugLocked(false);
            setEditingProject(null);
            setFormData({
              name: '',
              slug: '',
              description: '',
              type: 'content_engine',
              status: 'active',
              color: '#6366f1',
              default_platform: '',
              default_handle: '',
              notes: '',
              clientId: '',
            });
          }}
          className="flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Project</span>
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingProject ? 'Edit Project' : 'New Project'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium mb-1">
                    Name *
                  </label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Cleveland Clean"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="slug" className="block text-sm font-medium mb-1">
                    Slug *
                  </label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => {
                      setSlugLocked(true);
                      setFormData((prev) => ({ ...prev, slug: slugify(e.target.value) }));
                    }}
                    placeholder="cleveland-clean"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  rows={3}
                  placeholder="What is this project about?"
                />
              </div>
              <div>
                <label htmlFor="client" className="block text-sm font-medium mb-1">
                  Client (optional)
                </label>
                <select
                  id="client"
                  value={formData.clientId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, clientId: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                >
                  <option value="">No client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {clients.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create a client first from the Clients tab to link this project.
                  </p>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="type" className="block text-sm font-medium mb-1">
                    Type
                  </label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  >
                    {projectTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="status" className="block text-sm font-medium mb-1">
                    Status
                  </label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  >
                    {projectStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="platform" className="block text-sm font-medium mb-1">
                    Primary Platform
                  </label>
                  <Input
                    id="platform"
                    value={formData.default_platform}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, default_platform: e.target.value }))
                    }
                    placeholder="e.g. Instagram"
                  />
                </div>
                <div>
                  <label htmlFor="handle" className="block text-sm font-medium mb-1">
                    Handle
                  </label>
                  <Input
                    id="handle"
                    value={formData.default_handle}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, default_handle: e.target.value }))
                    }
                    placeholder="@clevelandclean"
                  />
                </div>
                <div>
                  <label htmlFor="color" className="block text-sm font-medium mb-1">
                    Accent Color
                  </label>
                  <input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-1 py-1"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="notes" className="block text-sm font-medium mb-1">
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  rows={3}
                  placeholder="Additional context, KPIs, collaborators..."
                />
              </div>
              <div className="flex space-x-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : editingProject ? 'Save Changes' : 'Create Project'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {projectsWithStats.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No projects yet. Start by creating one above.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projectsWithStats.map((project) => (
            <Card key={project.id} className="relative overflow-hidden">
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ backgroundColor: project.color || '#6366f1' }}
              />
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <FolderKanban className="h-4 w-4" />
                      <span>{project.name}</span>
                    </CardTitle>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {project.type.replace('_', ' ')} • {project.status}
                    </p>
                  </div>
                  <div className="flex space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => startEditing(project)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500"
                      onClick={() => handleDelete(project)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.description && (
                  <p className="text-sm text-muted-foreground">{project.description}</p>
                )}
                {project.client && (
                  <p className="text-xs font-medium text-muted-foreground">
                    Client: <span className="text-foreground">{project.client.name}</span>
                  </p>
                )}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-semibold">{project.stats.openTasks}</p>
                    <p className="text-xs text-muted-foreground">Open Tasks</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{project.stats.contentCount}</p>
                    <p className="text-xs text-muted-foreground">Content</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{project.stats.totalViews.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Views</p>
                  </div>
                </div>
                {project.channels && project.channels.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Channels</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {project.channels.map((channel) => (
                        <span
                          key={channel.id}
                          className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground"
                        >
                          {channel.platform.charAt(0).toUpperCase() + channel.platform.slice(1)}{' '}
                          {channel.handle ? `• ${channel.handle}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center space-x-1 text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>View board</span>
                  </Link>
                  {project.stats.lastPublishedAt && (
                    <span className="text-xs text-muted-foreground">
                      Last post {new Date(project.stats.lastPublishedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
