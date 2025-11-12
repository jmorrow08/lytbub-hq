'use client';
export const dynamic = "force-dynamic";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StatsCard } from '@/components/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDashboardStats, getTasks, getRevenue, getContent } from '@/lib/api';
import type { DashboardStats, Task, Revenue, Content } from '@/types';
import { CheckSquare, DollarSign, Video, Heart, FolderKanban, ArrowUpRight } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [recentRevenue, setRecentRevenue] = useState<Revenue[]>([]);
  const [recentContent, setRecentContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, tasksData, revenueData, contentData] = await Promise.all([
          getDashboardStats(),
          getTasks(),
          getRevenue(),
          getContent(),
        ]);

        setStats(statsData);
        setRecentTasks(tasksData);
        setRecentRevenue(revenueData);
        setRecentContent(contentData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load dashboard data</p>
      </div>
    );
  }

  const completionRate =
    stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to your personal control center</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Tasks"
          value={`${stats.totalTasks}`}
          icon={CheckSquare}
          description={`${stats.completedTasks} completed`}
          trend={{ value: completionRate, isPositive: completionRate >= 50 }}
        />
        <StatsCard
          title="Total Revenue"
          value={`$${stats.totalRevenue.toFixed(2)}`}
          icon={DollarSign}
          description={`$${stats.todayRevenue.toFixed(2)} today`}
        />
        <StatsCard
          title="Content Pieces"
          value={stats.totalContent}
          icon={Video}
          description={`${stats.totalViews} total views`}
        />
        <StatsCard
          title="Today's Health"
          value={stats.todayHealth ? 'Logged' : 'Not logged'}
          icon={Heart}
          description={
            stats.todayHealth ? `Energy: ${stats.todayHealth.energy}/10` : 'Log your health'
          }
        />
      </div>

      {/* Projects Overview */}
      {stats.projectSummaries && stats.projectSummaries.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Projects</h2>
              <p className="text-sm text-muted-foreground">
                Quick look at your most active initiatives
              </p>
            </div>
            <Link href="/projects" className="text-sm text-primary hover:underline">
              Manage projects →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.projectSummaries.map((summary) => (
              <Card key={summary.project.id} className="relative overflow-hidden">
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ backgroundColor: summary.project.color || '#6366f1' }}
                />
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center space-x-2">
                      <FolderKanban className="h-4 w-4 text-muted-foreground" />
                      <span>{summary.project.name}</span>
                    </span>
                    <span className="text-xs uppercase text-muted-foreground">
                      {summary.project.status}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground capitalize">
                    {summary.project.type.replace('_', ' ')}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Open Tasks</span>
                    <span className="font-semibold">{summary.openTasks}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Content</span>
                    <span className="font-semibold">{summary.contentCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Views</span>
                    <span className="font-semibold">{summary.totalViews.toLocaleString()}</span>
                  </div>
                  <Link
                    href={`/projects/${summary.project.id}`}
                    className="flex items-center space-x-1 text-sm text-primary hover:underline"
                  >
                    <span>Open board</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Recent Tasks */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">No tasks yet</p>
            ) : (
              <div className="space-y-2">
                {recentTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="flex items-center space-x-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        task.completed ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        task.completed ? 'line-through text-muted-foreground' : ''
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Revenue */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {recentRevenue.length === 0 ? (
              <p className="text-muted-foreground text-sm">No revenue logged yet</p>
            ) : (
              <div className="space-y-2">
                {recentRevenue.slice(0, 3).map((revenue) => (
                  <div key={revenue.id} className="flex justify-between items-center">
                    <span className="text-sm font-medium">{revenue.source}</span>
                    <span className="text-sm text-green-600">${revenue.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Content */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Content</CardTitle>
          </CardHeader>
          <CardContent>
            {recentContent.length === 0 ? (
              <p className="text-muted-foreground text-sm">No content logged yet</p>
            ) : (
              <div className="space-y-2">
                {recentContent.slice(0, 3).map((content) => (
                  <div key={content.id} className="space-y-1">
                    <div className="text-sm font-medium">{content.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {content.platform} • {content.views} views
                    </div>
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
