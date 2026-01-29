import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Public endpoint to get all licenses
 * No authentication required - this is used by the mobile app
 * Usage: GET /api/licenses/verify
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const licenseId = searchParams.get('licenseId');
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

    // Fetch all licenses (public access, no auth required)
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('id', licenseId)
      .single();

      console.log('Licenses:', license);

    if (licenseError || !license) {
      console.error('Error fetching licenses:', licenseError);
      return NextResponse.json(
        { 
          error: 'Failed to fetch licenses',
          details: licenseError?.message
        },
        { status: 500 }
      );
    }

    // Return all licenses
    return NextResponse.json(
      {
        success: true,
        verified: license?.id == licenseId,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('License fetch error:', error);
    return NextResponse.json(
      { 
        error: 'An unexpected error occurred',
        verified: false,
      },
      { status: 500 }
    );
  }
}