'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

type FormValues = Record<string, string | number | null | undefined>;

interface FormProps {
  title: string;
  fields: FormField[];
  onSubmit: (data: FormValues) => Promise<void>;
  submitLabel?: string;
  isLoading?: boolean;
}

export function Form({ title, fields, onSubmit, submitLabel = 'Submit', isLoading = false }: FormProps) {
  const [formData, setFormData] = useState<FormValues>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
    setFormData({});
  };

  const handleChange = (name: string, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.name}>
              <label htmlFor={field.name} className="block text-sm font-medium mb-1">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={formData[field.name] ?? ''}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              ) : field.type === 'select' ? (
                <select
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  value={formData[field.name] ?? ''}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select {field.label.toLowerCase()}</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={field.name}
                  name={field.name}
                  type={field.type}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={
                    field.type === 'number'
                      ? (formData[field.name] as number | undefined) ?? ''
                      : (formData[field.name] as string | undefined) ?? ''
                  }
                  onChange={(e) =>
                    handleChange(
                      field.name,
                      field.type === 'number'
                        ? (e.target.value === '' ? null : Number(e.target.value))
                        : e.target.value
                    )
                  }
                />
              )}
            </div>
          ))}
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Submitting...' : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
