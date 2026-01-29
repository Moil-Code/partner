'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast/use-toast';
import Logo from '@/components/ui/Logo';
import { ArrowLeft, Building2, Globe } from 'lucide-react';

export default function CreatePartnerPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [domain, setDomain] = useState('');


  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!partnerName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Partner name is required',
        type: 'error',
      });
      return;
    }

    if (!domain.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Domain is required',
        type: 'error',
      });
      return;
    }

    // Validate domain format
    const domainRegex = /^[a-z0-9][a-z0-9\.-]*\.[a-z]{2,}$/;
    if (!domainRegex.test(domain.toLowerCase())) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid domain (e.g., example.com)',
        type: 'error',
      });
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // Create partner with domain
      const { error: partnerError } = await supabase
        .from('partners')
        .insert({
          name: partnerName.trim(),
          domain: domain.toLowerCase().trim(),
          status: 'active',
        });

      if (partnerError) {
        throw new Error(partnerError.message);
      }

      toast({
        title: 'Success',
        description: `Partner "${partnerName}" created successfully`,
        type: 'success',
      });

      router.push('/moil-admin');
    } catch (error) {
      console.error('Error creating partner:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create partner',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="glass-panel border-b border-[var(--border)] sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Logo size="sm" showText={false} />
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Create New Partner</h1>
              <p className="text-sm text-[var(--text-secondary)]">Add a new partner organization</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => router.push('/moil-admin')}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card variant="glass">
          <CardHeader>
            <CardTitle>Partner Information</CardTitle>
            <CardDescription>
              Enter the partner name and their email domain
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreatePartner} className="space-y-6">
              {/* Partner Name */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  <Building2 className="w-4 h-4 inline mr-2" />
                  Partner Name *
                </label>
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="e.g., Queen Creek Chamber"
                  className="w-full px-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)]"
                  required
                />
              </div>

              {/* Domain */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  <Globe className="w-4 h-4 inline mr-2" />
                  Email Domain *
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g., queencreekchamber.com"
                  className="w-full px-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)]"
                  required
                />
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  Users with this email domain will be automatically assigned to this partner
                </p>
              </div>

              {/* Submit Button */}
              <div className="flex gap-3 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/moil-admin')}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={loading}
                  disabled={loading}
                >
                  Create Partner
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
