import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface Statistics {
  total: number;
  activated: number;
  pending: number;
}

interface LicenseStats {
  purchased_license_count: number;
  active_purchased_license_count: number;
  available_licenses: number;
}

interface LicenseOverviewProps {
  stats: Statistics;
  licenseStats: LicenseStats;
  onAddMember?: () => void;
  onViewReports?: () => void;
}

export function LicenseOverview({ stats, licenseStats, onAddMember, onViewReports }: LicenseOverviewProps) {
  const utilizationRate = stats.total > 0 ? Math.round((stats.activated / stats.total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Main Stats Card */}
      <Card variant="glass-panel" className="md:col-span-2 overflow-hidden relative border-none bg-gradient-to-br from-[var(--primary)] to-[var(--primary-800)] text-white shadow-lg">
        <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 p-24 bg-[var(--secondary)]/20 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2"></div>
        
        <CardContent className="relative z-10 p-8 flex flex-col justify-between h-full">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">License Overview</h2>
              <p className="text-white/70 text-sm">Manage your partner licenses</p>
            </div>
            <div className="glass-card bg-white/10 border-white/20 px-4 py-2 rounded-lg backdrop-blur-md">
              <span className="text-xs text-white/80 uppercase tracking-wider font-semibold">Utilization</span>
              <div className="text-2xl font-bold">{utilizationRate}%</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-auto">
            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:bg-white/15 transition-all duration-300">
              <div className="text-white/60 text-xs font-medium uppercase tracking-wide mb-1">Purchased</div>
              <div className="text-3xl font-bold">{licenseStats.purchased_license_count}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:bg-white/15 transition-all duration-300">
              <div className="text-white/60 text-xs font-medium uppercase tracking-wide mb-1">Available</div>
              <div className="text-3xl font-bold text-[var(--secondary-200)]">{licenseStats.available_licenses}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:bg-white/15 transition-all duration-300">
              <div className="text-white/60 text-xs font-medium uppercase tracking-wide mb-1">Activated</div>
              <div className="text-3xl font-bold text-[var(--accent)]">{stats.activated}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:bg-white/15 transition-all duration-300">
              <div className="text-white/60 text-xs font-medium uppercase tracking-wide mb-1">Pending</div>
              <div className="text-3xl font-bold">{stats.pending}</div>
            </div>
          </div>
          
          <div className="mt-6">
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[var(--secondary)] rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(245,158,11,0.5)]" 
                style={{ width: `${utilizationRate}%` }}
              ></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary Quick Stats or Action Hint */}
      <Card variant="glass" className="flex flex-col justify-center p-6 border-l-4 border-l-[var(--secondary)]">
        <div className="space-y-4">
          <div>
            <h3 className="text-heading font-semibold text-lg">Quick Actions</h3>
            <p className="text-body text-sm mt-1">Efficiently manage your team.</p>
          </div>
          
          <div className="space-y-3">
             <button 
               onClick={onAddMember}
               className="w-full flex items-center justify-between p-3 rounded-lg bg-[var(--surface-subtle)] hover:bg-[var(--surface)] border border-transparent hover:border-[var(--border)] transition-all cursor-pointer group"
             >
                <span className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors">Add New Member</span>
                <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[var(--primary)] shadow-sm group-hover:scale-110 transition-transform">+</span>
             </button>
             <button 
               onClick={onViewReports}
               className="w-full flex items-center justify-between p-3 rounded-lg bg-[var(--surface-subtle)] hover:bg-[var(--surface)] border border-transparent hover:border-[var(--border)] transition-all cursor-pointer group"
             >
                <span className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors">View Activity</span>
                <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[var(--primary)] shadow-sm group-hover:scale-110 transition-transform">→</span>
             </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
