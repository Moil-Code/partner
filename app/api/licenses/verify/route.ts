import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Public endpoint to verify license and organization
 * No authentication required - this is used by the mobile app
 * Usage: GET /api/licenses?licenseId=xxx&orgSlug=xxx
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const licenseId = searchParams.get('licenseId');
    const orgSlug = searchParams.get('orgSlug');

    if (!licenseId || !orgSlug) {
      return NextResponse.json(
        {
          error: 'License ID and Organization Slug are required',
          verified: false,
          partnerVerified: false,
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Query license separately
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('id', licenseId)
      .single();

    if (licenseError || !license) {
      return NextResponse.json(
        {
          error: 'License not found',
          verified: false,
          partnerVerified: false,
        },
        { status: 404 }
      );
    }

    // Query partner separately
    const partnerName = orgSlug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('id, name, domain, status')
      .ilike('name', partnerName)
      .eq('status', 'active')
      .single();

    if (partnerError || !partner) {
      return NextResponse.json(
        {
          error: 'Organization not found',
          verified: true,
          partnerVerified: false,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      verified: license?.id == licenseId,
      partnerVerified: partner?.name == partnerName,
    });

  } catch (error) {
    console.error('License verification error:', error);
    return NextResponse.json(
      {
        error: 'An unexpected error occurred',
        verified: false,
        partnerVerified: false,
      },
      { status: 500 }
    );
  }
}