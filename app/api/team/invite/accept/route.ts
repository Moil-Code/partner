import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST - Accept a team invitation
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
    }

    // Get user's email
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('email')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json({ error: 'Admin profile not found' }, { status: 404 });
    }

    // Get the invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .select(`
        *,
        team:teams (
          id,
          name,
          domain
        )
      `)
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 400 });
    }

    // Check if email matches
    if (invitation.email !== adminData.email) {
      return NextResponse.json({ 
        error: 'This invitation is for a different email address' 
      }, { status: 403 });
    }

    // Check if already a member of any team
    const { data: existingMembership } = await supabase
      .from('team_members')
      .select('id, team_id')
      .eq('admin_id', user.id)
      .single();

    if (existingMembership) {
      // Check if it's the same team
      if (existingMembership.team_id === invitation.team_id) {
        return NextResponse.json({ error: 'You are already a member of this team' }, { status: 400 });
      }
      // For now, users can only be in one team
      return NextResponse.json({ 
        error: 'You are already a member of another team. Please leave your current team first.' 
      }, { status: 400 });
    }

    // Add user as team member
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: invitation.team_id,
        admin_id: user.id,
        role: invitation.role,
        invited_by: invitation.invited_by,
      });

    if (memberError) {
      console.error('Add member error:', memberError);
      return NextResponse.json({ error: 'Failed to join team' }, { status: 500 });
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('team_invitations')
      .update({ 
        status: 'accepted', 
        accepted_at: new Date().toISOString() 
      })
      .eq('id', invitation.id);

    if (updateError) {
      console.error('Update invitation error:', updateError);
    }

    // Log activity
    await supabase.rpc('log_activity', {
      p_team_id: invitation.team_id,
      p_admin_id: user.id,
      p_activity_type: 'member_joined',
      p_description: `${adminData.email} joined the team as ${invitation.role}`,
      p_metadata: { 
        invited_by: invitation.invited_by, 
        role: invitation.role 
      }
    });

    return NextResponse.json({ 
      success: true,
      team: invitation.team,
      role: invitation.role,
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET - Get invitation details by token (for preview before accepting)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get the invitation (no auth required for preview)
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .select(`
        id,
        email,
        role,
        status,
        expires_at,
        team:teams (
          id,
          name,
          domain
        ),
        inviter:admins!team_invitations_invited_by_fkey (
          first_name,
          last_name,
          email
        )
      `)
      .eq('token', token)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ 
        error: 'This invitation has expired',
        expired: true 
      }, { status: 400 });
    }

    // Check if already used
    if (invitation.status !== 'pending') {
      return NextResponse.json({ 
        error: `This invitation has already been ${invitation.status}`,
        status: invitation.status 
      }, { status: 400 });
    }

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expires_at,
        team: invitation.team,
        inviter: invitation.inviter,
      }
    });
  } catch (error) {
    console.error('Get invitation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
