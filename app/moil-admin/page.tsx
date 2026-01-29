'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast/use-toast';
import Logo from '@/components/ui/Logo';
import { 
  Building2, 
  TrendingUp, 
  Plus,
  BarChart3,
  Shield,
  LogOut,
  Search,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle
} from 'lucide-react';

interface Partner {
  id: string;
  name: string;
  domain: string;
  status: string;
  created_at: string;
}

interface Stats {
  total_partners: number;
  active_partners: number;
  pending_partners: number;
  total_licenses: number;
  total_teams: number;
  total_admins: number;
}

export default function MoilAdminDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  useEffect(() => {
    checkAuthorization();
  }, []);

  const checkAuthorization = async () => {
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push('/login');
        return;
      }

      // Check if user is Moil admin (@moilapp.com)
      const { data: admin, error: adminError } = await supabase
        .from('admins')
        .select('email, global_role')
        .eq('id', user.id)
        .single();

      if (adminError || !admin) {
        toast({
          title: 'Access Denied',
          description: 'Admin account not found',
          type: 'error',
        });
        router.push('/admin/dashboard');
        return;
      }

      // Check if email is @moilapp.com
      if (!admin.email.endsWith('@moilapp.com')) {
        toast({
          title: 'Access Denied',
          description: 'This dashboard is only accessible to @moilapp.com accounts',
          type: 'error',
        });
        router.push('/admin/dashboard');
        return;
      }

      setAdminEmail(admin.email);
      setIsAuthorized(true);
      await fetchDashboardData();
    } catch (error) {
      console.error('Authorization error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const supabase = createClient();

      // Fetch all partners
      const { data: partnersData, error: partnersError } = await supabase
        .from('partners')
        .select('id, name, domain, status, created_at')
        .order('created_at', { ascending: false });

      if (partnersError) throw partnersError;
      setPartners(partnersData || []);

      // Calculate stats
      const totalPartners = partnersData?.length || 0;
      const activePartners = partnersData?.filter(p => p.status === 'active').length || 0;
      const pendingPartners = partnersData?.filter(p => p.status === 'pending').length || 0;

      // Fetch license count
      const { count: licenseCount } = await supabase
        .from('licenses')
        .select('id', { count: 'exact', head: true });

      // Fetch team count
      const { count: teamCount } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true });

      // Fetch admin count
      const { count: adminCount } = await supabase
        .from('admins')
        .select('id', { count: 'exact', head: true });

      setStats({
        total_partners: totalPartners,
        active_partners: activePartners,
        pending_partners: pendingPartners,
        total_licenses: licenseCount || 0,
        total_teams: teamCount || 0,
        total_admins: adminCount || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load dashboard data',
        type: 'error',
      });
    }
  };

  const handleToggleStatus = async (partner: Partner) => {
    setUpdatingStatus(partner.id);
    try {
      const supabase = createClient();
      const newStatus = partner.status === 'active' ? 'suspended' : 'active';
      
      const { error } = await supabase
        .from('partners')
        .update({ status: newStatus })
        .eq('id', partner.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Partner ${newStatus === 'active' ? 'activated' : 'suspended'} successfully`,
        type: 'success',
      });

      await fetchDashboardData();
    } catch (error) {
      console.error('Error updating partner status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update partner status',
        type: 'error',
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleApprovePartner = async (partner: Partner) => {
    setUpdatingStatus(partner.id);
    try {
      const supabase = createClient();
      
      // 1. Update partner status to active
      const { error: partnerError } = await supabase
        .from('partners')
        .update({ status: 'active' })
        .eq('id', partner.id);

      if (partnerError) throw partnerError;

      // 2. Update all admins with matching email domain to link them to this partner
      // and set their role to partner_admin
      const { error: adminError } = await supabase
        .from('admins')
        .update({ 
          partner_id: partner.id,
          global_role: 'partner_admin'
        })
        .ilike('email', `%@${partner.domain}`);

      if (adminError) {
        console.error('Error updating admins:', adminError);
        // Don't fail - partner is already approved
      }

      toast({
        title: 'Partner Approved!',
        description: `${partner.name} has been approved. Users from ${partner.domain} can now sign in.`,
        type: 'success',
      });

      await fetchDashboardData();
    } catch (error) {
      console.error('Error approving partner:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve partner',
        type: 'error',
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleRejectPartner = async (partner: Partner) => {
    setUpdatingStatus(partner.id);
    try {
      const supabase = createClient();
      
      // Delete the partner record (rejection)
      const { error } = await supabase
        .from('partners')
        .delete()
        .eq('id', partner.id);

      if (error) throw error;

      toast({
        title: 'Partner Rejected',
        description: `${partner.name} access request has been rejected.`,
        type: 'success',
      });

      await fetchDashboardData();
    } catch (error) {
      console.error('Error rejecting partner:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject partner',
        type: 'error',
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const filteredPartners = partners.filter(p => {
    const query = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(query) ||
           p.domain.toLowerCase().includes(query);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="glass-panel border-b border-[var(--border)] sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo size="sm" showText={false} />
              <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[var(--primary)]" />
                  Moil Admin Dashboard
                </h1>
                <p className="text-sm text-[var(--text-secondary)]">{adminEmail}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => router.push('/admin/dashboard')}>
                Partner Dashboard
              </Button>
              <Button variant="ghost" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">Total Partners</p>
                  <p className="text-3xl font-bold text-[var(--text-primary)]">{stats?.total_partners || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">Active Partners</p>
                  <p className="text-3xl font-bold text-[var(--accent)]">{stats?.active_partners || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)] to-green-400 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">Pending Requests</p>
                  <p className="text-3xl font-bold text-[var(--warning)]">{stats?.pending_partners || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--warning)] to-amber-400 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Partner Requests */}
        {partners.filter(p => p.status === 'pending').length > 0 && (
          <Card variant="glass" className="mb-8 border-l-4 border-l-[var(--warning)]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--warning)]/10 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-[var(--warning)]" />
                </div>
                <div>
                  <CardTitle>Pending Partner Requests</CardTitle>
                  <CardDescription>Review and approve new partner access requests</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {partners.filter(p => p.status === 'pending').map((partner) => (
                  <div key={partner.id} className="flex items-center justify-between p-4 bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)]">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-[var(--primary)]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">{partner.name}</p>
                        <p className="text-sm text-[var(--text-secondary)]">
                          <span className="font-mono bg-[var(--primary)]/5 px-2 py-0.5 rounded text-[var(--primary)]">{partner.domain}</span>
                          <span className="mx-2">•</span>
                          Requested {new Date(partner.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRejectPartner(partner)}
                        disabled={updatingStatus === partner.id}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApprovePartner(partner)}
                        disabled={updatingStatus === partner.id}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Partners List */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Partners</CardTitle>
                <CardDescription>Manage all partner organizations</CardDescription>
              </div>
              <Button onClick={() => router.push('/moil-admin/create-partner')}>
                <Plus className="w-4 h-4 mr-2" />
                Add Partner
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  placeholder="Search partners..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Partners Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Partner</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Domain</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Created</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPartners.map((partner) => (
                    <tr key={partner.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-subtle)] transition-colors">
                      <td className="py-4 px-4">
                        <p className="font-medium text-[var(--text-primary)]">{partner.name}</p>
                      </td>
                      <td className="py-4 px-4 text-[var(--text-secondary)]">
                        <span className="font-medium">{partner.domain}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          partner.status === 'active' ? 'bg-green-100 text-green-800' :
                          partner.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {partner.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-[var(--text-secondary)] text-sm">
                        {new Date(partner.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Button
                          variant={partner.status === 'active' ? 'outline' : 'primary'}
                          size="sm"
                          onClick={() => handleToggleStatus(partner)}
                          disabled={updatingStatus === partner.id}
                        >
                          {partner.status === 'active' ? (
                            <>
                              <XCircle className="w-4 h-4 mr-2" />
                              Suspend
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Activate
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
