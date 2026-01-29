import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current admin user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login.' },
        { status: 401 }
      );
    }

    // Verify user is an admin
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('*')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json(
        { error: 'Access denied. Admin account required.' },
        { status: 403 }
      );
    }

    // Get user's team membership and team info
    const { data: teamMember } = await supabase
      .from('team_members')
      .select(`
        team_id,
        team:teams (
          id,
          purchased_license_count
        )
      `)
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;
    const team = teamMember?.team as unknown as { id: string; purchased_license_count: number } | null;

    // Get all licenses for the team (or admin if no team)
    let licensesQuery = supabase
      .from('licenses')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (teamId) {
      // If user is in a team, get all team licenses
      licensesQuery = licensesQuery.eq('team_id', teamId);
    } else {
      // Fallback to admin-level licenses
      licensesQuery = licensesQuery.eq('admin_id', user.id);
    }

    const { data: licenses, error: licensesError } = await licensesQuery;

    // Get admin info for licenses to show who added them
    const adminIds = [...new Set((licenses || []).map(l => l.performed_by || l.admin_id).filter(Boolean))];
    let adminsMap: Record<string, { id: string; first_name: string; last_name: string; email: string }> = {};
    
    if (adminIds.length > 0) {
      const { data: admins } = await supabase
        .from('admins')
        .select('id, first_name, last_name, email')
        .in('id', adminIds);
      
      if (admins) {
        adminsMap = admins.reduce((acc, admin) => {
          acc[admin.id] = admin;
          return acc;
        }, {} as typeof adminsMap);
      }
    }

    if (licensesError) {
      console.error('Licenses fetch error:', licensesError);
      return NextResponse.json(
        { error: 'Failed to fetch licenses' },
        { status: 500 }
      );
    }

    // Calculate statistics
    const assignedLicenses = licenses?.length || 0;
    const activated = licenses?.filter(l => l.is_activated).length || 0;
    const pending = assignedLicenses - activated;
    const purchasedLicenseCount = team?.purchased_license_count || 0;
    const availableLicenses = purchasedLicenseCount - assignedLicenses;

    // Format licenses for response - include who added the license for team transparency
    const formattedLicenses = (licenses || []).map(license => {
      const addedById = license.performed_by || license.admin_id;
      const addedByAdmin = addedById ? adminsMap[addedById] : null;
      return {
        id: license.id,
        email: license.email,
        isActivated: license.is_activated,
        activatedAt: license.activated_at,
        createdAt: license.created_at,
        businessName: license.business_name,
        businessType: license.business_type,
        messageId: license.message_id,
        emailStatus: license.email_status,
        addedBy: addedByAdmin ? {
          id: addedByAdmin.id,
          name: `${addedByAdmin.first_name} ${addedByAdmin.last_name}`.trim(),
          email: addedByAdmin.email,
        } : null,
      };
    });

    return NextResponse.json(
      { 
        licenses: formattedLicenses,
        statistics: {
          purchased: purchasedLicenseCount,
          assigned: assignedLicenses,
          activated,
          pending,
          available: availableLicenses,
          // Legacy fields
          total: assignedLicenses,
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('List licenses error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
