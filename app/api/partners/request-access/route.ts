import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // Use regular client - RLS allows any authenticated user to create partners
    const supabase = await createClient();

    // Check if partner with this domain already exists
    const { data: existingPartner } = await supabase
      .from('partners')
      .select('id, name, status')
      .eq('domain', domain)
      .single();

    if (existingPartner) {
      if (existingPartner.status === 'active') {
        // Partner already exists and is active - link the admin to it
        if (userId) {
          await supabase
            .from('admins')
            .update({ 
              partner_id: existingPartner.id,
              global_role: 'partner_admin'
            })
            .eq('id', userId);
        }
        return NextResponse.json({
          success: true,
          message: 'Your account has been linked to the existing partner',
          partner: existingPartner,
          userId: userId || null,
        });
      } else if (existingPartner.status === 'suspended') {
        return NextResponse.json(
          { error: 'This domain has been suspended. Please contact support.' },
          { status: 409 }
        );
      }
    }

    // Create the partner with 'active' status (admin creates their own partner)
    const { data: newPartner, error: partnerError } = await supabase
      .from('partners')
      .insert({
        name: organizationName.trim(),
        domain: domain,
        status: 'active',
        program_name: organizationName.trim(),
        full_name: organizationName.trim(),
        logo_initial: organizationName.trim().charAt(0).toUpperCase(),
      })
      .select()
      .single();

    if (partnerError) {
      console.error('Error creating partner:', partnerError);
      return NextResponse.json(
        { error: 'Failed to create partner' },
        { status: 500 }
      );
    }

    // Link the admin to the newly created partner
    if (userId) {
      const { error: adminError } = await supabase
        .from('admins')
        .update({ 
          partner_id: newPartner.id,
          global_role: 'partner_admin'
        })
        .eq('id', userId);

      if (adminError) {
        console.error('Error linking admin to partner:', adminError);
        // Don't fail - partner is created, admin can be linked later
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Partner created successfully',
      partner: {
        id: newPartner.id,
        name: newPartner.name,
        domain: newPartner.domain,
        status: newPartner.status,
      },
      userId: userId || null,
    });

  } catch (error) {
    console.error('Error in partner creation:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
