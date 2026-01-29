import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPartnerAccessRequestEmail } from '@/lib/email';
import crypto from 'crypto';

// Generate a secure random token for approval links
function generateApprovalToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationName, email, userId } = body;

    // Validate required fields
    if (!organizationName || !email) {
      return NextResponse.json(
        { error: 'Organization name and email are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Extract domain from email
    const domain = email.split('@')[1].toLowerCase();

    // Validate organization name length
    if (organizationName.trim().length < 2 || organizationName.trim().length > 100) {
      return NextResponse.json(
        { error: 'Organization name must be between 2 and 100 characters' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if partner with this domain already exists
    const { data: existingPartner } = await supabase
      .from('partners')
      .select('id, name, status')
      .eq('domain', domain)
      .single();

    if (existingPartner) {
      if (existingPartner.status === 'pending') {
        return NextResponse.json(
          { error: 'A request for this domain is already pending approval' },
          { status: 409 }
        );
      } else if (existingPartner.status === 'active') {
        return NextResponse.json(
          { error: 'This domain is already registered. Please sign in instead.' },
          { status: 409 }
        );
      } else if (existingPartner.status === 'suspended') {
        return NextResponse.json(
          { error: 'This domain has been suspended. Please contact support.' },
          { status: 409 }
        );
      }
    }

    // Generate a secure approval token
    const approvalToken = generateApprovalToken();

    // Create the partner with 'pending' status and approval token
    // User is already created client-side via Supabase Auth
    const { data: newPartner, error: partnerError } = await supabase
      .from('partners')
      .insert({
        name: organizationName.trim(),
        domain: domain,
        status: 'pending',
        approval_token: approvalToken,
      })
      .select()
      .single();

    if (partnerError) {
      console.error('Error creating partner:', partnerError);
      return NextResponse.json(
        { error: 'Failed to create partner request' },
        { status: 500 }
      );
    }

    // Build the approval URL
    const baseUrl = process.env.NEXT_PUBLIC_PARTNER_PORTAL_URL || 'https://partners.moilapp.com';
    const approvalUrl = `${baseUrl}/grant-access/${approvalToken}`;

    // Send notification email to Moil admins with direct approval link
    const emailResult = await sendPartnerAccessRequestEmail({
      organizationName: organizationName.trim(),
      domain: domain,
      requesterEmail: email,
      requestedAt: new Date().toISOString(),
      approvalUrl: approvalUrl,
    });

    if (!emailResult.success) {
      console.error('Failed to send notification email:', emailResult.error);
      // Don't fail the request if email fails - the partner is still created
    }

    return NextResponse.json({
      success: true,
      message: 'Partner access request submitted successfully',
      partner: {
        id: newPartner.id,
        name: newPartner.name,
        domain: newPartner.domain,
        status: newPartner.status,
      },
      userId: userId || null,
      emailSent: emailResult.success,
    });

  } catch (error) {
    console.error('Error in partner access request:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
