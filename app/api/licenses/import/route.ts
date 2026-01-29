import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendBatchLicenseActivationEmails } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is an admin
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('*')
      .eq('id', user.id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get user's team and team info
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

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read CSV file
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    // Skip header row
    const dataLines = lines.slice(1);

    // Check available licenses for team before importing
    if (teamId && team) {
      const { count: assignedCount } = await supabase
        .from('licenses')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      const availableLicenses = (team.purchased_license_count || 0) - (assignedCount || 0);
      
      if (dataLines.length > availableLicenses) {
        return NextResponse.json({
          error: `Only ${availableLicenses} license(s) available. You're trying to import ${dataLines.length}.`
        }, { status: 400 });
      }
    }
    
    // Parse and validate emails using functional programming
    const parsedEmails = dataLines
      .map(line => line.split(',').map(field => field.trim())[0])
      .filter(email => email && email.includes('@'));

    // Check for existing licenses in parallel
    const existingChecks = await Promise.all(
      parsedEmails.map(async (email) => {
        let existingQuery = supabase
          .from('licenses')
          .select('id')
          .eq('email', email.toLowerCase());

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
      email: email.toLowerCase(),
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

    // Prepare batch email data
    const emailBatch = (insertedLicenses || []).map(license => ({
      email: license.email,
      licenseId: license.id,
      activationUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/register?licenseId=${license.id}&ref=moilPartners&org=moil-partners`,
    }));

    // Send batch emails
    const emailResults = await sendBatchLicenseActivationEmails({
      licenses: emailBatch,
      adminName: `${admin.first_name} ${admin.last_name}`,
      adminEmail: admin.email,
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
      failed: existingEmails.length + (dataLines.length - parsedEmails.length),
      emailsSent: emailResults.sent,
      emailsFailed: emailResults.failed,
      errors: existingEmails.map(email => `License already exists for: ${email}`),
    };

    // Log activity
    if (teamMember?.team_id && results.success > 0) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_admin_id: user.id,
        p_activity_type: 'licenses_imported',
        p_description: `Imported ${results.success} licenses from CSV`,
        p_metadata: { 
          success_count: results.success, 
          failed_count: results.failed,
          emails_sent: results.emailsSent 
        }
      });
    }

    return NextResponse.json({
      message: `Import complete: ${results.success} licenses added, ${results.emailsSent} emails sent, ${results.failed} failed`,
      results,
    }, { status: 200 });

  } catch (error) {
    console.error('CSV import error:', error);
    return NextResponse.json(
      { error: 'Failed to import CSV' },
      { status: 500 }
    );
  }
}
