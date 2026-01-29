import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendLicenseActivationEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const { licenseId } = await request.json();

    if (!licenseId) {
      return NextResponse.json(
        { error: 'License ID is required' },
        { status: 400 }
      );
    }

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

    // Get user's team
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;

    // Get the license - team members can resend for any team license
    let licenseQuery = supabase
      .from('licenses')
      .select('*')
      .eq('id', licenseId);

    if (teamId) {
      // If user is in a team, they can resend for any team license
      licenseQuery = licenseQuery.eq('team_id', teamId);
    } else {
      // Solo admin can only resend for their own licenses
      licenseQuery = licenseQuery.eq('admin_id', user.id);
    }

    const { data: license, error: licenseError } = await licenseQuery.single();

    if (licenseError || !license) {
      return NextResponse.json(
        { error: 'License not found or you do not have permission to resend' },
        { status: 404 }
      );
    }

    if (license.is_activated) {
      return NextResponse.json(
        { error: 'License is already activated' },
        { status: 400 }
      );
    }

    // Resend activation email with license ID for activation
    const activationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/register?licenseId=${license.id}&ref=moilPartners&org=moil-partners`;

    const emailResult = await sendLicenseActivationEmail({
      email: license.email,
      activationUrl,
      adminName: `${adminData.first_name} ${adminData.last_name}`,
    });

    // Update message_id and email_status based on result
    if (emailResult.success && emailResult.messageId) {
      await supabase
        .from('licenses')
        .update({ 
          message_id: emailResult.messageId,
          email_status: 'sent'
        })
        .eq('id', license.id);
    } else {
      console.error('Failed to resend activation email:', emailResult.error);
      await supabase
        .from('licenses')
        .update({ 
          email_status: 'failed'
        })
        .eq('id', license.id);
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }

    // Log activity
    if (teamMember?.team_id) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_admin_id: user.id,
        p_activity_type: 'license_resend',
        p_description: `Resent activation email to ${license.email}`,
        p_metadata: { license_id: license.id, email: license.email }
      });
    }

    return NextResponse.json(
      { message: 'Activation email resent successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Resend email error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
