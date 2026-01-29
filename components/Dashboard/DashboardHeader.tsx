import React from 'react';
import Logo from '@/components/ui/Logo';
import { Activity, Users, LogOut, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardHeaderProps {
  onShowActivity: () => void;
  onShowTeam: () => void;
  onLogout: () => void;
  partnerName?: string;
  partnerLogo?: string;
}

export function DashboardHeader({ onShowActivity, onShowTeam, onLogout, partnerName, partnerLogo }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b-0 rounded-b-xl mb-6">
      <div className="layout-container h-18 flex items-center justify-between py-3">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <img src='https://res.cloudinary.com/drlcisipo/image/upload/v1705704261/Website%20images/logo_gox0fw.png' alt="Moil Logo" className="w-12 h-6 md:w-16 md:h-8" />

          </div>

          <div className="hidden md:flex h-8 w-[1px] bg-gradient-to-b from-transparent via-[var(--glass-border)] to-transparent mx-2" />

          <nav className="hidden md:flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-[var(--text-secondary)] font-medium">
              <LayoutDashboard className="w-4 h-4 mr-2 text-[var(--primary)]" />
              Overview
            </Button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onShowActivity}
            className="hidden md:flex bg-white/40 hover:bg-white/60 border-[var(--glass-border)]"
          >
            <Activity className="w-4 h-4 mr-2 text-[var(--accent)]" />
            Activity
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onShowTeam}
            className="hidden md:flex bg-white/40 hover:bg-white/60 border-[var(--glass-border)]"
          >
            <Users className="w-4 h-4 mr-2 text-[var(--secondary)]" />
            Team
          </Button>

          <div className="h-6 w-[1px] bg-[var(--glass-border)] mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <LogOut className="w-4 h-4 mr-2" />
            <span className="hidden md:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
