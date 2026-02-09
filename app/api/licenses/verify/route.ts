import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Public endpoint to verify licenses and optionally org
 * No authentication required - this is used by the mobile app
 * Usage: GET /api/licenses/verify?licenseId=xxx&org=org-slug
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const licenseId = searchParams.get('licenseId');
    const orgSlug = searchParams.get('org');

    // Use service role key to bypass RLS for public access
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Fetch license by ID
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*, admin:admins(partner_id)')
      .eq('id', licenseId)
      .single();

    console.log('License:', license);

    if (licenseError || !license) {
      console.error('Error fetching license:', licenseError);
      return NextResponse.json(
        { 
          error: 'License not found',
          verified: false,
          details: licenseError?.message
        },
        { status: 404 }
      );
    }

    // If orgSlug is provided, verify it matches the license's partner
    let orgVerified = true;
    let partnerInfo = null;

    if (orgSlug) {
      // Reverse the slug transformation to get the original name
      // Convert "nerds-labs" -> "Nerds Labs" (capitalize each word)
      const reversedName = orgSlug
        .split('-')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      console.log('🔍 Verifying org - Slug:', orgSlug, 'Reversed:', reversedName);

      // Get the partner associated with the license's admin
      const partnerId = license.admin?.partner_id;

      if (partnerId) {
        // Fetch the partner
        const { data: partner, error: partnerError } = await supabase
          .from('partners')
          .select('id, name, program_name, status')
          .eq('id', partnerId)
          .single();

        if (partnerError || !partner) {
          console.error('Error fetching partner:', partnerError);
          orgVerified = false;
        } else {
          // Check if the reversed name matches the partner's name or program_name (case-insensitive)
          const nameMatch = partner.name?.toLowerCase() === reversedName.toLowerCase();
          const programNameMatch = partner.program_name?.toLowerCase() === reversedName.toLowerCase();
          
          // Also check partial match
          const namePartialMatch = partner.name?.toLowerCase().includes(reversedName.toLowerCase());
          const programNamePartialMatch = partner.program_name?.toLowerCase().includes(reversedName.toLowerCase());

          orgVerified = nameMatch || programNameMatch || namePartialMatch || programNamePartialMatch;
          
          partnerInfo = {
            id: partner.id,
            name: partner.name,
            programName: partner.program_name,
            status: partner.status,
          };

          console.log('🔍 Partner match result:', { 
            reversedName, 
            partnerName: partner.name, 
            programName: partner.program_name,
            orgVerified 
          });
        }
      } else {
        // License has no associated partner (moil-admin created)
        // Try to find partner by name/program_name directly
        const { data: matchingPartner } = await supabase
          .from('partners')
          .select('id, name, program_name, status')
          .or(`name.ilike.${reversedName},program_name.ilike.${reversedName}`)
          .single();

        if (matchingPartner) {
          partnerInfo = {
            id: matchingPartner.id,
            name: matchingPartner.name,
            programName: matchingPartner.program_name,
            status: matchingPartner.status,
          };
          orgVerified = true;
        } else {
          orgVerified = false;
        }
      }
    }

    // Return verification result
    return NextResponse.json(
      {
        success: true,
        verified: license?.id === licenseId,
        orgVerified: orgSlug ? orgVerified : null,
        license: {
          id: license.id,
          email: license.email,
          isActivated: license.is_activated,
          businessName: license.business_name,
        },
        partner: partnerInfo,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('License verify error:', error);
    return NextResponse.json(
      { 
        error: 'An unexpected error occurred',
        verified: false,
      },
      { status: 500 }
    );
  }
}