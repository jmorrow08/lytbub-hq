'use client';

import { useMemo, useState } from 'react';
import type { PendingInvoiceItem, Project } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPendingInvoiceItems, updatePendingInvoiceItem } from '@/lib/api';
import { cn } from '@/lib/utils';

type PendingItemsTableProps = {
  items: PendingInvoiceItem[];
  projects: Project[];
  loading?: boolean;
  onRefresh: () => Promise<void>;
  onSelectionChange?: (selectedIds: string[]) => void;
};

type EditableRow = {
  description: string;
  quantity: string;
  unitPrice: string;
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function PendingItemsTable({
  items,
  projects,
  loading = false,
  onRefresh,
  onSelectionChange,
}: PendingItemsTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    projectId: '',
    description: '',
    quantity: '1',
    unitPrice: '',
  });
  const [editingRows, setEditingRows] = useState<Record<string, EditableRow>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [voidingRowId, setVoidingRowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    if (projectFilter === 'all') return items;
    return items.filter((item) => item.project_id === projectFilter);
  }, [items, projectFilter]);

  const totalSelectedAmount = useMemo(() => {
    return selectedIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is PendingInvoiceItem => Boolean(item))
      .reduce((sum, item) => {
        const calculatedAmount =
          item.amount_cents ??
          Math.round((Number(item.quantity ?? 1) || 1) * (item.unit_price_cents ?? 0));
        return sum + calculatedAmount;
      }, 0);
  }, [items, selectedIds]);

  const handleToggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId];
      onSelectionChange?.(next);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
      onSelectionChange?.([]);
    } else {
      const ids = filteredItems.map((item) => item.id);
      setSelectedIds(ids);
      onSelectionChange?.(ids);
    }
  };

  const handleStartEdit = (item: PendingInvoiceItem) => {
    setEditingRows((prev) => ({
      ...prev,
      [item.id]: {
        description: item.description,
        quantity: String(item.quantity ?? 1),
        unitPrice: ((item.unit_price_cents ?? 0) / 100).toFixed(2),
      },
    }));
  };

  const handleCancelEdit = (itemId: string) => {
    setEditingRows((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleSaveEdit = async (item: PendingInvoiceItem) => {
    const edit = editingRows[item.id];
    if (!edit) return;
    const quantity = Number.parseFloat(edit.quantity);
    const unitPrice = Number.parseFloat(edit.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setError('Unit price must be greater than zero.');
      return;
    }
    setError(null);
    setSavingRowId(item.id);
    try {
      await updatePendingInvoiceItem(item.id, {
        description: edit.description.trim(),
        quantity,
        unitPriceCents: Math.round(unitPrice * 100),
      });
      handleCancelEdit(item.id);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update pending item.');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleVoidItem = async (itemId: string) => {
    setVoidingRowId(itemId);
    try {
      await updatePendingInvoiceItem(itemId, { status: 'voided' });
      await onRefresh();
      setSelectedIds((prev) => {
        const next = prev.filter((id) => id !== itemId);
        onSelectionChange?.(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to void pending item.');
    } finally {
      setVoidingRowId(null);
    }
  };

  const handleAddItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!addForm.projectId) {
      setAddError('Select a project.');
      return;
    }
    if (!addForm.description.trim()) {
      setAddError('Provide a description.');
      return;
    }
    const quantity = Number.parseFloat(addForm.quantity);
    const unitPrice = Number.parseFloat(addForm.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setAddError('Quantity must be greater than zero.');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setAddError('Unit price must be greater than zero.');
      return;
    }
    setAddError(null);
    setAdding(true);
    try {
      await createPendingInvoiceItems({
        projectId: addForm.projectId,
        description: addForm.description.trim(),
        quantity,
        unitPriceCents: Math.round(unitPrice * 100),
        sourceType: 'manual',
      });
      setAddForm({ projectId: addForm.projectId, description: '', quantity: '1', unitPrice: '' });
      await onRefresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Unable to create pending item.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Pending Invoice Items</CardTitle>
          <p className="text-sm text-muted-foreground">
            Queue billable work to invoice later or include in a quick invoice.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={projectFilter}
            onChange={(event) => {
              setProjectFilter(event.target.value);
              setSelectedIds([]);
              onSelectionChange?.([]);
            }}
          >
            <option value="all">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-2 md:grid-cols-12" onSubmit={handleAddItem}>
          <select
            className="md:col-span-3 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={addForm.projectId}
            onChange={(event) => setAddForm((prev) => ({ ...prev, projectId: event.target.value }))}
            required
          >
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <Input
            className="md:col-span-4"
            placeholder="Description"
            value={addForm.description}
            onChange={(event) =>
              setAddForm((prev) => ({ ...prev, description: event.target.value }))
            }
            required
          />
          <Input
            className="md:col-span-2"
            type="number"
            min="0"
            step="0.01"
            placeholder="Qty"
            value={addForm.quantity}
            onChange={(event) => setAddForm((prev) => ({ ...prev, quantity: event.target.value }))}
            required
          />
          <Input
            className="md:col-span-2"
            type="number"
            min="0"
            step="0.01"
            placeholder="Unit price (USD)"
            value={addForm.unitPrice}
            onChange={(event) => setAddForm((prev) => ({ ...prev, unitPrice: event.target.value }))}
            required
          />
          <Button className="md:col-span-1" type="submit" disabled={adding}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
        {addError && <p className="text-xs text-red-500">{addError}</p>}

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    checked={selectedIds.length > 0 && selectedIds.length === filteredItems.length}
                    onChange={handleToggleAll}
                  />
                </th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">
                    {loading ? 'Loading pending items…' : 'No pending items.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  const editState = editingRows[item.id];
                  const amount =
                    (item.amount_cents ??
                      Math.round(
                        (Number(item.quantity ?? 1) || 1) * (item.unit_price_cents ?? 0),
                      )) / 100;
                  return (
                    <tr key={item.id} className={cn(isSelected && 'bg-accent/30')}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        {editState ? (
                          <Input
                            value={editState.description}
                            onChange={(event) =>
                              setEditingRows((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], description: event.target.value },
                              }))
                            }
                          />
                        ) : (
                          <div>
                            <p className="font-medium">{item.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {projects.find((project) => project.id === item.project_id)?.name ||
                                'Unknown project'}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right align-top">
                        {editState ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editState.quantity}
                            onChange={(event) =>
                              setEditingRows((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], quantity: event.target.value },
                              }))
                            }
                          />
                        ) : (
                          Number(item.quantity ?? 1)
                        )}
                      </td>
                      <td className="px-3 py-2 text-right align-top">
                        {editState ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editState.unitPrice}
                            onChange={(event) =>
                              setEditingRows((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], unitPrice: event.target.value },
                              }))
                            }
                          />
                        ) : (
                          currency.format((item.unit_price_cents ?? 0) / 100)
                        )}
                      </td>
                      <td className="px-3 py-2 text-right align-top font-semibold">
                        {currency.format(amount)}
                      </td>
                      <td className="px-3 py-2 align-top capitalize">
                        {item.source_type ?? 'manual'}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right align-top space-x-2">
                        {editState ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleSaveEdit(item)}
                              disabled={savingRowId === item.id}
                            >
                              {savingRowId === item.id ? 'Saving…' : 'Save'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCancelEdit(item.id)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => handleStartEdit(item)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-500"
                              onClick={() => handleVoidItem(item.id)}
                              disabled={voidingRowId === item.id}
                            >
                              {voidingRowId === item.id ? 'Voiding…' : 'Void'}
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between rounded-md border border-border/60 bg-muted/40 px-4 py-2 text-sm">
            <span>
              Selected {selectedIds.length} {selectedIds.length === 1 ? 'item' : 'items'} totaling{' '}
              <span className="font-semibold">{currency.format(totalSelectedAmount / 100)}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => handleToggleAll()}>
              Clear selection
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
