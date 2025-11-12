'use client';
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContent, createContent, updateContent, deleteContent } from '@/lib/api';
import type { Content, CreateContentData, UpdateContentData } from '@/types';
import { Video, Plus, Eye, Calendar, Pencil, Trash } from 'lucide-react';

const platforms = [
  { value: 'YouTube', label: 'YouTube' },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Twitter', label: 'Twitter' },
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'Blog', label: 'Blog' },
  { value: 'Other', label: 'Other' },
];

export default function ContentPage() {
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    platform: '',
    views: '',
    url: '',
    published_at: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Content | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchContent = async () => {
    try {
      const data = await getContent();
      setContent(data);
    } catch (error) {
      console.error('Error fetching content:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.platform) return;

    setSubmitting(true);
    try {
      const baseData = {
        title: formData.title.trim(),
        platform: formData.platform,
        views: formData.views ? parseInt(formData.views, 10) : 0,
      };

      const trimmedUrl = formData.url.trim();
      const isoDate = formData.published_at
        ? new Date(`${formData.published_at}T00:00:00`).toISOString()
        : null;

      if (editingEntry) {
        const payload: UpdateContentData = {
          ...baseData,
          url: trimmedUrl || null,
          published_at: isoDate,
        };

        await updateContent(editingEntry.id, payload);
      } else {
        const payload: CreateContentData = {
          ...baseData,
          ...(trimmedUrl ? { url: trimmedUrl } : {}),
          ...(isoDate ? { published_at: isoDate } : {}),
        };

        await createContent(payload);
      }

      setFormData({ title: '', platform: '', views: '', url: '', published_at: '' });
      setShowForm(false);
      setIsEditing(false);
      setEditingEntry(null);
      fetchContent();
    } catch (error) {
      console.error('Error creating content:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const startEditingEntry = (entry: Content) => {
    setIsEditing(true);
    setEditingEntry(entry);
    setShowForm(true);
    setFormData({
      title: entry.title,
      platform: entry.platform,
      views: entry.views ? String(entry.views) : '',
      url: entry.url || '',
      published_at: entry.published_at ? entry.published_at.split('T')[0] : '',
    });
  };

  const resetFormState = () => {
    setShowForm(false);
    setFormData({ title: '', platform: '', views: '', url: '', published_at: '' });
    setIsEditing(false);
    setEditingEntry(null);
  };

  const handleDeleteEntry = async (entry: Content) => {
    const confirmed = window.confirm(`Delete content entry "${entry.title}"?`);
    if (!confirmed) return;

    try {
      setDeletingId(entry.id);
      await deleteContent(entry.id);
      if (editingEntry?.id === entry.id) {
        resetFormState();
      }
      fetchContent();
    } catch (error) {
      console.error('Error deleting content entry:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const totalViews = content.reduce((sum, item) => sum + item.views, 0);
  const totalContent = content.length;

  // Group content by platform
  const contentByPlatform = content.reduce((acc, item) => {
    acc[item.platform] = (acc[item.platform] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading content...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Content</h1>
          <p className="text-muted-foreground">Track your content performance across platforms</p>
        </div>
        <Button
          onClick={() => {
            resetFormState();
            setShowForm(true);
          }}
          className="flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Content</span>
        </Button>
      </div>

      {/* Content Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Content</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalContent}</div>
            <p className="text-xs text-muted-foreground">
              Pieces published
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalViews.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across all platforms
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platforms</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(contentByPlatform).length}</div>
            <p className="text-xs text-muted-foreground">
              Active platforms
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Add Content Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{isEditing ? 'Edit Content' : 'Add New Content'}</CardTitle>
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
                  placeholder="Enter content title"
                  required
                />
              </div>
              <div>
                <label htmlFor="platform" className="block text-sm font-medium mb-1">
                  Platform *
                </label>
                <select
                  id="platform"
                  value={formData.platform}
                  onChange={(e) => setFormData(prev => ({ ...prev, platform: e.target.value }))}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  required
                >
                  <option value="">Select platform</option>
                  {platforms.map((platform) => (
                    <option key={platform.value} value={platform.value}>
                      {platform.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="views" className="block text-sm font-medium mb-1">
                    Views
                  </label>
                  <Input
                    id="views"
                    type="number"
                    min="0"
                    value={formData.views}
                    onChange={(e) => setFormData(prev => ({ ...prev, views: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="published_at" className="block text-sm font-medium mb-1">
                    Published Date
                  </label>
                  <Input
                    id="published_at"
                    type="date"
                    value={formData.published_at}
                    onChange={(e) => setFormData(prev => ({ ...prev, published_at: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="url" className="block text-sm font-medium mb-1">
                  URL
                </label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div className="flex space-x-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Content'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetFormState}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Content List */}
      <Card>
        <CardHeader>
          <CardTitle>Content Library</CardTitle>
        </CardHeader>
        <CardContent>
          {content.length === 0 ? (
            <p className="text-muted-foreground text-sm">No content logged yet</p>
          ) : (
            <div className="space-y-4">
              {content.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <div>
                        <h4 className="font-medium">{item.title}</h4>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <span className="flex items-center space-x-1">
                            <Video className="h-3 w-3" />
                            <span>{item.platform}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Eye className="h-3 w-3" />
                            <span>{item.views.toLocaleString()} views</span>
                          </span>
                          {item.published_at && (
                            <span className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(item.published_at).toLocaleDateString()}</span>
                            </span>
                          )}
                        </div>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline"
                          >
                            View content →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditingEntry(item)}
                      className="flex items-center space-x-1"
                    >
                      <Pencil className="h-4 w-4" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteEntry(item)}
                      disabled={deletingId === item.id}
                      className="flex items-center space-x-1 text-red-500"
                    >
                      <Trash className="h-4 w-4" />
                      <span>{deletingId === item.id ? 'Deleting...' : 'Delete'}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
