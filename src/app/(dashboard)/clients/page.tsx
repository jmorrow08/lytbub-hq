'use client';
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient, deleteClient, getClients, updateClient } from '@/lib/api';
import type { Client } from '@/types';
import { Edit, Plus, Trash2, ExternalLink } from 'lucide-react';

const emptyForm = {
  name: '',
  company_name: '',
  contact_name: '',
  email: '',
  phone: '',
  notes: '',
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...emptyForm });

  const loadClients = async () => {
    setLoading(true);
    try {
      const list = await getClients();
      setClients(list);
    } catch (error) {
      console.error('Error loading clients', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const resetForm = () => {
    setShowForm(false);
    setEditingClient(null);
    setFormData({ ...emptyForm });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    try {
      if (editingClient) {
        await updateClient(editingClient.id, { ...formData });
      } else {
        await createClient({ ...formData });
      }
      resetForm();
      loadClients();
    } catch (error) {
      console.error('Error saving client', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (client: Client) => {
    const confirmed = window.confirm(
      `Delete client "${client.name}"? Associated projects will remain linked to this client ID.`
    );
    if (!confirmed) return;

    try {
      await deleteClient(client.id);
      setClients((prev) => prev.filter((c) => c.id !== client.id));
    } catch (error) {
      console.error('Error deleting client', error);
    }
  };

  const startEditing = (client: Client) => {
    setEditingClient(client);
    setShowForm(true);
    setFormData({
      name: client.name || '',
      company_name: client.company_name || '',
      contact_name: client.contact_name || '',
      email: client.email || '',
      phone: client.phone || '',
      notes: client.notes || '',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading clients…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clients</h1>
          <p className="text-muted-foreground">
            Manage client profiles, contact details, and jump into their billing activity.
          </p>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setEditingClient(null);
            setFormData({ ...emptyForm });
          }}
          className="flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Client</span>
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingClient ? 'Edit Client' : 'New Client'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium mb-1">
                    Client Name *
                  </label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="company" className="block text-sm font-medium mb-1">
                    Company
                  </label>
                  <Input
                    id="company"
                    value={formData.company_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, company_name: e.target.value }))
                    }
                    placeholder="Acme Co."
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="contact" className="block text-sm font-medium mb-1">
                    Contact Name
                  </label>
                  <Input
                    id="contact"
                    value={formData.contact_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, contact_name: e.target.value }))
                    }
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-1">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="jane@acme.com"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium mb-1">
                    Phone
                  </label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="(415) 555-1234"
                  />
                </div>
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium mb-1">
                    Notes
                  </label>
                  <Input
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Preferred billing cadence or references"
                  />
                </div>
              </div>

              <div className="flex space-x-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : editingClient ? 'Save Changes' : 'Create Client'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No clients yet. Create one above to start linking projects and payments.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => (
            <Card key={client.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>{client.name}</CardTitle>
                  {client.company_name && (
                    <p className="text-xs text-muted-foreground">{client.company_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEditing(client)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500"
                    onClick={() => handleDelete(client)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {client.contact_name && (
                  <p className="text-muted-foreground">Contact: {client.contact_name}</p>
                )}
                {client.email && <p className="text-muted-foreground">Email: {client.email}</p>}
                {client.phone && <p className="text-muted-foreground">Phone: {client.phone}</p>}
                {client.notes && <p className="text-muted-foreground">Notes: {client.notes}</p>}
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link href={`/clients/${client.id}`} className="flex items-center gap-1">
                    <ExternalLink className="h-4 w-4" />
                    <span>View</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
