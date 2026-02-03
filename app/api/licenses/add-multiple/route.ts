import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendBatchLicenseActivationEmails } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const { emails } = await request.json();

    // Validate emails array
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: 'Valid email addresses are required' },
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

    // Verify user is an admin and get partner info
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('*, partner:partners(id, name)')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json(
        { error: 'Access denied. Admin account required.' },
        { status: 403 }
      );
    }

    // Get partner name for activation URL
    const partnerInfo = adminData.partner as { id: string; name: string } | null;
    const partnerName = partnerInfo?.name || 'moil-partners';
    const orgSlug = partnerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

    // Check available licenses for team
    let availableLicenses = Infinity; // Unlimited for solo admins
    if (teamId && team) {
      const { count: assignedCount } = await supabase
        .from('licenses')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      availableLicenses = (team.purchased_license_count || 0) - (assignedCount || 0);
      
      if (availableLicenses <= 0) {
        return NextResponse.json(
          { error: 'No available licenses. Please purchase more licenses.' },
          { status: 400 }
        );
      }

      if (emails.length > availableLicenses) {
        return NextResponse.json(
          { error: `Only ${availableLicenses} license(s) available. You're trying to add ${emails.length}.` },
          { status: 400 }
        );
      }
    }

    // Parse and validate emails using functional programming
    const parsedEmails = emails
      .map(email => email.trim().toLowerCase())
      .filter(email => email && email.includes('@'));

    const invalidEmails = emails.filter(email => {
      const trimmed = email.trim().toLowerCase();
      return !trimmed || !trimmed.includes('@');
    });

    // Check for existing licenses in parallel
    const existingChecks = await Promise.all(
      parsedEmails.map(async (email) => {
        let existingQuery = supabase
          .from('licenses')
          .select('id')
          .eq('email', email);

        if (teamId) {
          existingQuery = existingQuery.eq('team_id', teamId);
        } else {
          existingQuery = existingQuery.eq('admin_id', user.id);
        }

        const { data: existing } = await existingQuery.single();
        return { email, exists: !!existing };
      })
    );

    // Filter out existing emails
    const newEmails = existingChecks
      .filter(check => !check.exists)
      .map(check => check.email);

    const existingEmails = existingChecks
      .filter(check => check.exists)
      .map(check => check.email);

    // Insert all new licenses in batch
    const licensesToInsert = newEmails.map(email => ({
      email,
      admin_id: user.id,
      business_name: '',
      business_type: '',
      is_activated: false,
      team_id: teamId || null,
      performed_by: user.id,
    }));

    const { data: insertedLicenses, error: insertError } = await supabase
      .from('licenses')
      .insert(licensesToInsert)
      .select();

    if (insertError) {
      console.error('Batch insert error:', insertError);
      return NextResponse.json(
        { error: `Failed to insert licenses: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Prepare batch email data with dynamic partner org name
    const emailBatch = (insertedLicenses || []).map(license => ({
      email: license.email,
      licenseId: license.id,
      activationUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/register?licenseId=${license.id}&ref=moilPartners&org=${orgSlug}`,
    }));

    // Send batch emails
    const emailResults = await sendBatchLicenseActivationEmails({
      licenses: emailBatch,
      adminName: `${adminData.first_name} ${adminData.last_name}`,
      adminEmail: adminData.email,
    });

    // Update message_id and email_status for each license based on results
    if (emailResults.results && Array.isArray(emailResults.results) && emailResults.results.length > 0) {
      await Promise.all(
        emailResults.results.map(async (result) => {
          if (result.success && result.messageId) {
            await supabase
              .from('licenses')
              .update({
                message_id: result.messageId,
                email_status: 'sent',
              })
              .eq('id', result.licenseId);
          } else {
            await supabase
              .from('licenses')
              .update({
                email_status: 'failed',
              })
              .eq('id', result.licenseId);
          }
        })
      );
    } else if (insertedLicenses && insertedLicenses.length > 0) {
      // If no results returned, mark all inserted licenses as failed
      await Promise.all(
        insertedLicenses.map(async (license) => {
          await supabase
            .from('licenses')
            .update({
              email_status: 'failed',
            })
            .eq('id', license.id);
        })
      );
    }

    const results = {
      success: insertedLicenses?.length || 0,
      failed: existingEmails.length + invalidEmails.length,
      emailsSent: emailResults.sent,
      emailsFailed: emailResults.failed,
      errors: [
        ...invalidEmails.map(email => `Invalid email format: ${email}`),
        ...existingEmails.map(email => `License already exists for: ${email}`)
      ],
      licenses: (insertedLicenses || []).map(license => ({
        id: license.id,
        email: license.email,
        isActivated: license.is_activated,
        createdAt: license.created_at,
      })),
    };

    // Log activity
    if (teamMember?.team_id && results.success > 0) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_admin_id: user.id,
        p_activity_type: 'license_added',
        p_description: `Added ${results.success} license${results.success > 1 ? 's' : ''}`,
        p_metadata: { 
          count: results.success,
          emails_sent: results.emailsSent 
        }
      });
    }

    return NextResponse.json(
      { 
        message: `Processed ${emails.length} emails: ${results.success} licenses added, ${results.emailsSent} emails sent, ${results.failed} failed`,
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Add multiple licenses error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
