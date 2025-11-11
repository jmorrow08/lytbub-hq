'use client';
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getHealth, createOrUpdateHealth, getTodayHealth } from '@/lib/api';
import type { Health, CreateHealthData } from '@/types';
import { Heart, Activity, Moon, Dumbbell, Calendar } from 'lucide-react';

export default function HealthPage() {
  const [health, setHealth] = useState<Health[]>([]);
  const [todayHealth, setTodayHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    energy: '',
    sleep_hours: '',
    workout: false,
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchHealth = async () => {
    try {
      const [healthData, todayData] = await Promise.all([
        getHealth(),
        getTodayHealth(),
      ]);
      setHealth(healthData);
      setTodayHealth(todayData);
    } catch (error) {
      console.error('Error fetching health:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitting(true);
    try {
      await createOrUpdateHealth({
        date: new Date().toISOString().split('T')[0],
        energy: formData.energy ? parseInt(formData.energy) : undefined,
        sleep_hours: formData.sleep_hours ? parseFloat(formData.sleep_hours) : undefined,
        workout: formData.workout,
        notes: formData.notes,
      } as CreateHealthData);

      setFormData({ energy: '', sleep_hours: '', workout: false, notes: '' });
      setShowForm(false);
      fetchHealth();
    } catch (error) {
      console.error('Error saving health:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate stats
  const totalEntries = health.length;
  const workoutDays = health.filter(h => h.workout).length;
  const avgSleep = health.length > 0
    ? health.reduce((sum, h) => sum + (h.sleep_hours || 0), 0) / health.length
    : 0;
  const avgEnergy = health.length > 0
    ? health.reduce((sum, h) => sum + (h.energy || 0), 0) / health.length
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading health data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Health</h1>
          <p className="text-muted-foreground">Track your daily wellness metrics</p>
        </div>
        {!todayHealth && (
          <Button onClick={() => setShowForm(true)} className="flex items-center space-x-2">
            <Heart className="h-4 w-4" />
            <span>Log Today's Health</span>
          </Button>
        )}
      </div>

      {/* Today's Health Status */}
      {todayHealth && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/10">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-green-700 dark:text-green-400">
              <Heart className="h-5 w-5" />
              <span>Today's Health Logged</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              {todayHealth.energy && (
                <div className="text-center">
                  <Activity className="h-6 w-6 mx-auto mb-2 text-green-600" />
                  <div className="text-2xl font-bold">{todayHealth.energy}/10</div>
                  <div className="text-sm text-muted-foreground">Energy</div>
                </div>
              )}
              {todayHealth.sleep_hours && (
                <div className="text-center">
                  <Moon className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                  <div className="text-2xl font-bold">{todayHealth.sleep_hours}h</div>
                  <div className="text-sm text-muted-foreground">Sleep</div>
                </div>
              )}
              <div className="text-center">
                <Dumbbell className={`h-6 w-6 mx-auto mb-2 ${todayHealth.workout ? 'text-orange-600' : 'text-gray-400'}`} />
                <div className="text-2xl font-bold">{todayHealth.workout ? '✓' : '✗'}</div>
                <div className="text-sm text-muted-foreground">Workout</div>
              </div>
              {todayHealth.notes && (
                <div className="text-center">
                  <Calendar className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                  <div className="text-sm font-medium">Notes</div>
                  <div className="text-xs text-muted-foreground mt-1">{todayHealth.notes}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEntries}</div>
            <p className="text-xs text-muted-foreground">
              Days tracked
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Energy</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgEnergy.toFixed(1)}/10</div>
            <p className="text-xs text-muted-foreground">
              Average rating
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Sleep</CardTitle>
            <Moon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgSleep.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground">
              Hours per night
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Workout Days</CardTitle>
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workoutDays}</div>
            <p className="text-xs text-muted-foreground">
              Days with exercise
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Add Health Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Log Today's Health</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="energy" className="block text-sm font-medium mb-1">
                    Energy Level (1-10)
                  </label>
                  <Input
                    id="energy"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.energy}
                    onChange={(e) => setFormData(prev => ({ ...prev, energy: e.target.value }))}
                    placeholder="How energetic do you feel?"
                  />
                </div>
                <div>
                  <label htmlFor="sleep_hours" className="block text-sm font-medium mb-1">
                    Sleep Hours
                  </label>
                  <Input
                    id="sleep_hours"
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={formData.sleep_hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, sleep_hours: e.target.value }))}
                    placeholder="Hours of sleep"
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.workout}
                    onChange={(e) => setFormData(prev => ({ ...prev, workout: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Did you workout today?</span>
                </label>
              </div>
              <div>
                <label htmlFor="notes" className="block text-sm font-medium mb-1">
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional notes about your health today..."
                  className="w-full px-3 py-2 border border-input bg-background rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  rows={3}
                />
              </div>
              <div className="flex space-x-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Health Data'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setFormData({ energy: '', sleep_hours: '', workout: false, notes: '' });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Health History */}
      <Card>
        <CardHeader>
          <CardTitle>Health History</CardTitle>
        </CardHeader>
        <CardContent>
          {health.length === 0 ? (
            <p className="text-muted-foreground text-sm">No health data logged yet</p>
          ) : (
            <div className="space-y-4">
              {health.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <div>
                        <h4 className="font-medium">
                          {new Date(entry.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </h4>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-1">
                          {entry.energy && (
                            <span className="flex items-center space-x-1">
                              <Activity className="h-3 w-3" />
                              <span>Energy: {entry.energy}/10</span>
                            </span>
                          )}
                          {entry.sleep_hours && (
                            <span className="flex items-center space-x-1">
                              <Moon className="h-3 w-3" />
                              <span>Sleep: {entry.sleep_hours}h</span>
                            </span>
                          )}
                          <span className="flex items-center space-x-1">
                            <Dumbbell className={`h-3 w-3 ${entry.workout ? 'text-orange-600' : 'text-gray-400'}`} />
                            <span>{entry.workout ? 'Worked out' : 'No workout'}</span>
                          </span>
                        </div>
                        {entry.notes && (
                          <p className="text-sm text-muted-foreground mt-2">{entry.notes}</p>
                        )}
                      </div>
                    </div>
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
