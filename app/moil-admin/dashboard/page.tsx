'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast/use-toast';
import Logo from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { 
  Building2, 
  TrendingUp, 
  Plus,
  Shield,
  LogOut,
  Search,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  Key,
  Users2,
  LayoutDashboard,
  Activity,
  Briefcase
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

interface Team {
  id: string;
  name: string;
  domain: string;
  partner_id: string;
  partner_name?: string;
  created_at: string;
  member_count?: number;
  license_count?: number;
}

type TabType = 'overview' | 'partners' | 'teams';

export default function MoilAdminDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

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

      console.log('Partners fetch result:', { partnersData, partnersError });

      if (partnersError) throw partnersError;
      setPartners(partnersData || []);

      // Fetch all teams
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, domain, partner_id, created_at')
        .order('created_at', { ascending: false });
      
      console.log('Teams fetch result:', { teamsData, teamsError });

      if (!teamsError && teamsData) {
        // Get partner names for each team
        const partnerIds = [...new Set(teamsData.filter(t => t.partner_id).map(t => t.partner_id))];
        let partnerMap: Record<string, string> = {};
        
        if (partnerIds.length > 0) {
          const { data: partnerNames } = await supabase
            .from('partners')
            .select('id, name')
            .in('id', partnerIds);
          
          if (partnerNames) {
            partnerMap = partnerNames.reduce((acc: Record<string, string>, p) => {
              acc[p.id] = p.name;
              return acc;
            }, {});
          }
        }

        // Get license counts for each team
        const teamIds = teamsData.map(t => t.id);
        const { data: licenseCounts } = await supabase
          .from('licenses')
          .select('team_id')
          .in('team_id', teamIds);

        const licenseCountMap: Record<string, number> = {};
        if (licenseCounts) {
          licenseCounts.forEach((l: { team_id: string }) => {
            licenseCountMap[l.team_id] = (licenseCountMap[l.team_id] || 0) + 1;
          });
        }

        const teamsWithDetails = teamsData.map((team: any) => ({
          id: team.id,
          name: team.name,
          domain: team.domain,
          partner_id: team.partner_id,
          partner_name: team.partner_id ? partnerMap[team.partner_id] || 'Unknown' : 'No Partner',
          created_at: team.created_at,
          license_count: licenseCountMap[team.id] || 0,
        }));
        setTeams(teamsWithDetails);
      }

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
    <div className="min-h-screen bg-[var(--background)] font-sans text-[var(--text-primary)]">
      {/* Header */}
      <header className="bg-[var(--surface)]/80 backdrop-blur-xl border-b border-[var(--border)] sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-4">
                <Logo size="sm" showText={false} />
                <div>
                  <h1 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 leading-tight">
                    <Shield className="w-5 h-5 text-[var(--primary)]" />
                    Moil Admin
                  </h1>
                  <p className="text-xs text-[var(--text-secondary)] font-medium">Platform Administration</p>
                </div>
              </div>
              
              <div className="hidden md:block h-8 w-[1px] bg-[var(--border)]" />
              
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span className="bg-[var(--surface-subtle)] px-2 py-1 rounded-md border border-[var(--border)]">{adminEmail}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle variant="dropdown" className="w-36" />
              
              <div className="h-6 w-[1px] bg-[var(--border)] mx-1" />
              
              <Button 
                variant="ghost" 
                onClick={handleLogout} 
                className="text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
          
          {/* Navigation Tabs - integrated into header bottom */}
          <div className="flex items-center gap-1 -mb-px pt-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'overview'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]/50 rounded-t-lg'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('partners')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'partners'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]/50 rounded-t-lg'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Partners
              {stats?.pending_partners ? (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-[var(--warning)] text-white rounded-full shadow-sm">
                  {stats.pending_partners}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'teams'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]/50 rounded-t-lg'
              }`}
            >
              <Users2 className="w-4 h-4" />
              Teams
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card variant="glass" className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Total Partners</p>
                      <p className="text-3xl font-bold text-[var(--text-primary)]">{stats?.total_partners || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-light)] flex items-center justify-center shadow-lg">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Active Partners</p>
                      <p className="text-3xl font-bold text-[var(--accent)]">{stats?.active_partners || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)] to-emerald-400 flex items-center justify-center shadow-lg">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Total Teams</p>
                      <p className="text-3xl font-bold text-[var(--info)]">{stats?.total_teams || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--info)] to-blue-400 flex items-center justify-center shadow-lg">
                      <Users2 className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Total Licenses</p>
                      <p className="text-3xl font-bold text-[var(--secondary)]">{stats?.total_licenses || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--secondary)] to-orange-400 flex items-center justify-center shadow-lg">
                      <Key className="w-6 h-6 text-white" />
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
                      <CardTitle className="text-[var(--text-primary)]">Pending Partner Requests</CardTitle>
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
                              <span className="font-mono bg-[var(--primary)]/10 px-2 py-0.5 rounded text-[var(--primary)]">{partner.domain}</span>
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
                            className="text-[var(--error)] border-[var(--error)]/30 hover:bg-[var(--error)]/10"
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

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card 
                variant="glass" 
                className="cursor-pointer hover:shadow-lg transition-all hover:border-[var(--primary)]/30"
                onClick={() => router.push('/moil-admin/create-partner')}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                      <Plus className="w-6 h-6 text-[var(--primary)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">Add New Partner</p>
                      <p className="text-sm text-[var(--text-secondary)]">Create a new partner organization</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card 
                variant="glass" 
                className="cursor-pointer hover:shadow-lg transition-all hover:border-[var(--primary)]/30"
                onClick={() => setActiveTab('partners')}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-[var(--accent)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">Manage Partners</p>
                      <p className="text-sm text-[var(--text-secondary)]">View and manage all partners</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card 
                variant="glass" 
                className="cursor-pointer hover:shadow-lg transition-all hover:border-[var(--primary)]/30"
                onClick={() => setActiveTab('teams')}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--info)]/10 flex items-center justify-center">
                      <Users2 className="w-6 h-6 text-[var(--info)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">View Teams</p>
                      <p className="text-sm text-[var(--text-secondary)]">Browse all created teams</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card variant="glass">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-[var(--primary)]" />
                  <CardTitle className="text-[var(--text-primary)]">Recent Partners</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {partners.slice(0, 5).map((partner) => (
                    <div key={partner.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--surface-subtle)] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] font-bold">
                          {partner.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">{partner.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)]">{partner.domain}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        partner.status === 'active' 
                          ? 'bg-[var(--accent)]/10 text-[var(--accent)]' 
                          : partner.status === 'pending'
                          ? 'bg-[var(--warning)]/10 text-[var(--warning)]'
                          : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                      }`}>
                        {partner.status}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Partners Tab */}
        {activeTab === 'partners' && (
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-[var(--text-primary)]">Partners</CardTitle>
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
                    className="w-full pl-10 pr-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
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
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] font-bold">
                              {partner.name.charAt(0)}
                            </div>
                            <p className="font-medium text-[var(--text-primary)]">{partner.name}</p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-mono text-sm bg-[var(--surface-subtle)] px-2 py-1 rounded text-[var(--text-secondary)]">{partner.domain}</span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            partner.status === 'active' 
                              ? 'bg-[var(--accent)]/10 text-[var(--accent)]' 
                              : partner.status === 'pending'
                              ? 'bg-[var(--warning)]/10 text-[var(--warning)]'
                              : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                          }`}>
                            {partner.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-[var(--text-secondary)] text-sm">
                          {new Date(partner.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/moil-admin/partners/${partner.id}`)}
                              title="View Partner"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/moil-admin/licenses?partnerId=${partner.id}`)}
                              title="Manage Licenses"
                            >
                              <Key className="w-4 h-4" />
                            </Button>
                            {partner.status === 'pending' ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRejectPartner(partner)}
                                  disabled={updatingStatus === partner.id}
                                  className="text-[var(--error)]"
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleApprovePartner(partner)}
                                  disabled={updatingStatus === partner.id}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Approve
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant={partner.status === 'active' ? 'outline' : 'primary'}
                                size="sm"
                                onClick={() => handleToggleStatus(partner)}
                                disabled={updatingStatus === partner.id}
                              >
                                {partner.status === 'active' ? (
                                  <>
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Suspend
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Activate
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPartners.length === 0 && (
                  <div className="text-center py-12">
                    <Building2 className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                    <p className="text-[var(--text-secondary)]">No partners found</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Teams Tab */}
        {activeTab === 'teams' && (
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-[var(--text-primary)]">Teams</CardTitle>
                  <CardDescription>View all teams across partners</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    placeholder="Search teams..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                  />
                </div>
              </div>

              {/* Teams Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams
                  .filter(team => 
                    team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    team.partner_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    team.domain?.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((team) => (
                  <div 
                    key={team.id} 
                    className="p-4 bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)] hover:border-[var(--primary)]/30 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => router.push(`/moil-admin/teams/${team.id}`)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--info)]/10 flex items-center justify-center text-[var(--info)] font-bold">
                          {team.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">{team.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)]">{team.domain}</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Partner & License Info */}
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        <span className="text-xs text-[var(--text-secondary)]">{team.partner_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        <span className="text-xs text-[var(--text-secondary)]">{team.license_count || 0} licenses</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        Created {new Date(team.created_at).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/moil-admin/teams/${team.id}`);
                        }}
                        className="text-[var(--primary)]"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {teams.length === 0 && (
                <div className="text-center py-12">
                  <Users2 className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                  <p className="text-[var(--text-secondary)]">No teams found</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
