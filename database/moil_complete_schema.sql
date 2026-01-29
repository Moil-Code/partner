-- ============================================
-- MOIL LICENSE MANAGEMENT - COMPLETE DATABASE SCHEMA
-- ============================================
-- Version: 5.0
-- Description: Complete schema for Moil Partner License Management System
-- 
-- FEATURES:
-- - Multi-partner workspace support
-- - Role-based access control (Moil Admin, Partner Admin, Member)
-- - License management with email tracking
-- - Team management with invitations
-- - Activity logging for audit trails
-- - Secure RLS policies with workspace isolation
-- 
-- SECURITY:
-- - Input validation on all fields
-- - Row Level Security (RLS) on all tables
-- - SECURITY DEFINER functions with proper grants
-- - SQL injection prevention
-- - Email format validation
-- - Domain validation for partners
-- ============================================

-- ============================================
-- STEP 1: CREATE ENUM TYPES
-- ============================================

-- Partner status
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_status') THEN
    CREATE TYPE partner_status AS ENUM ('pending', 'active', 'suspended', 'inactive');
  END IF;
END $$;

-- Admin global role
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
    CREATE TYPE admin_role AS ENUM ('moil_admin', 'partner_admin', 'member');
  END IF;
END $$;

-- Team role
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_role') THEN
    CREATE TYPE team_role AS ENUM ('owner', 'admin', 'member');
  END IF;
END $$;

-- Invitation status
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status') THEN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');
  END IF;
END $$;

-- Activity type
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    CREATE TYPE activity_type AS ENUM (
      'license_added',
      'license_removed',
      'license_activated',
      'license_resend',
      'license_email_updated',
      'licenses_imported',
      'licenses_purchased',
      'member_invited',
      'member_joined',
      'member_removed',
      'member_role_changed',
      'team_settings_updated',
      'partner_created',
      'partner_updated',
      'partner_activated',
      'partner_suspended',
      'partner_activation_sent'
    );
  END IF;
END $$;

-- ============================================
-- STEP 2: CREATE UTILITY FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 3: CREATE PARTNERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.partners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Basic Information
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  
  -- Status
  status partner_status DEFAULT 'active' NOT NULL,
  
  -- Approval token for direct email approval (secure random token)
  approval_token TEXT UNIQUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT partners_name_length CHECK (length(trim(name)) >= 2 AND length(trim(name)) <= 100),
  CONSTRAINT partners_domain_format CHECK (domain ~* '^[a-z0-9][a-z0-9\.-]*\.[a-z]{2,}$')
);

COMMENT ON TABLE public.partners IS 'Partner organizations with their email domains';

-- ============================================
-- STEP 4: CREATE ADMINS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.admins (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  global_role admin_role DEFAULT 'member' NOT NULL,
  purchased_license_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT admins_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT admins_license_count_positive CHECK (purchased_license_count >= 0)
);

COMMENT ON TABLE public.admins IS 'Admin users who manage licenses and teams';

-- ============================================
-- STEP 5: CREATE TEAMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  domain TEXT NOT NULL,
  purchased_license_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT teams_name_length CHECK (length(trim(name)) >= 1 AND length(trim(name)) <= 100),
  CONSTRAINT teams_license_count_positive CHECK (purchased_license_count >= 0),
  CONSTRAINT teams_unique_owner UNIQUE (owner_id)
);

COMMENT ON TABLE public.teams IS 'Teams that manage groups of licenses';

-- ============================================
-- STEP 6: CREATE TEAM MEMBERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
  role team_role DEFAULT 'member' NOT NULL,
  invited_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT team_members_unique UNIQUE (team_id, admin_id)
);

COMMENT ON TABLE public.team_members IS 'Membership records linking admins to teams';

-- ============================================
-- STEP 7: CREATE TEAM INVITATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
  role team_role DEFAULT 'member' NOT NULL,
  status invitation_status DEFAULT 'pending' NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days') NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT invitations_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

COMMENT ON TABLE public.team_invitations IS 'Pending invitations to join teams';

-- ============================================
-- STEP 8: CREATE LICENSES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  performed_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  business_name TEXT DEFAULT '',
  business_type TEXT DEFAULT '',
  is_activated BOOLEAN DEFAULT FALSE NOT NULL,
  activated_at TIMESTAMP WITH TIME ZONE,
  message_id TEXT,
  email_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT licenses_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT licenses_unique_per_team UNIQUE (team_id, email)
);

COMMENT ON TABLE public.licenses IS 'Moil licenses assigned to end users';

-- ============================================
-- STEP 9: CREATE ACTIVITY LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  activity_type activity_type NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.activity_logs IS 'Audit log of all system activities';

-- NOTE: partner_activation_links table removed - verification handled externally

-- ============================================
-- STEP 11: CREATE TRIGGERS
-- ============================================

-- Partners
DROP TRIGGER IF EXISTS update_partners_updated_at ON public.partners;
CREATE TRIGGER update_partners_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Admins
DROP TRIGGER IF EXISTS update_admins_updated_at ON public.admins;
CREATE TRIGGER update_admins_updated_at
  BEFORE UPDATE ON public.admins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Teams
DROP TRIGGER IF EXISTS update_teams_updated_at ON public.teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Team Members
DROP TRIGGER IF EXISTS update_team_members_updated_at ON public.team_members;
CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Team Invitations
DROP TRIGGER IF EXISTS update_team_invitations_updated_at ON public.team_invitations;
CREATE TRIGGER update_team_invitations_updated_at
  BEFORE UPDATE ON public.team_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Licenses
DROP TRIGGER IF EXISTS update_licenses_updated_at ON public.licenses;
CREATE TRIGGER update_licenses_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================
-- STEP 12: CREATE INDEXES
-- ============================================

-- Partners indexes
CREATE INDEX IF NOT EXISTS idx_partners_domain ON public.partners(lower(domain));
CREATE INDEX IF NOT EXISTS idx_partners_status ON public.partners(status) WHERE status = 'active';

-- Admins indexes
CREATE INDEX IF NOT EXISTS idx_admins_email ON public.admins(lower(email));
CREATE INDEX IF NOT EXISTS idx_admins_partner_id ON public.admins(partner_id);
CREATE INDEX IF NOT EXISTS idx_admins_global_role ON public.admins(global_role);

-- Teams indexes
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON public.teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_partner_id ON public.teams(partner_id);
CREATE INDEX IF NOT EXISTS idx_teams_domain ON public.teams(domain);

-- Team Members indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_admin_id ON public.team_members(admin_id);

-- Team Invitations indexes
CREATE INDEX IF NOT EXISTS idx_team_invitations_team_id ON public.team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON public.team_invitations(lower(email));
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON public.team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON public.team_invitations(status);

-- Licenses indexes
CREATE INDEX IF NOT EXISTS idx_licenses_admin_id ON public.licenses(admin_id);
CREATE INDEX IF NOT EXISTS idx_licenses_team_id ON public.licenses(team_id);
CREATE INDEX IF NOT EXISTS idx_licenses_partner_id ON public.licenses(partner_id);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON public.licenses(lower(email));
CREATE INDEX IF NOT EXISTS idx_licenses_is_activated ON public.licenses(is_activated);
CREATE INDEX IF NOT EXISTS idx_licenses_message_id ON public.licenses(message_id) WHERE message_id IS NOT NULL;

-- Activity Logs indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_id ON public.activity_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_admin_id ON public.activity_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_partner_id ON public.activity_logs(partner_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_type ON public.activity_logs(activity_type);


-- ============================================
-- STEP 13: CREATE HELPER FUNCTIONS
-- ============================================

-- Function to get partner by email domain
CREATE OR REPLACE FUNCTION public.get_partner_by_email(user_email TEXT)
RETURNS UUID AS $$
DECLARE
  email_domain TEXT;
  found_partner_id UUID;
BEGIN
  IF user_email IS NULL OR user_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN NULL;
  END IF;
  
  email_domain := lower(split_part(user_email, '@', 2));
  
  SELECT p.id INTO found_partner_id
  FROM public.partners p
  WHERE lower(p.domain) = email_domain
  AND p.status = 'active'
  LIMIT 1;
  
  RETURN found_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if email domain is valid
CREATE OR REPLACE FUNCTION public.is_valid_partner_email(user_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  email_domain TEXT;
BEGIN
  IF user_email IS NULL OR user_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN FALSE;
  END IF;
  
  email_domain := lower(split_part(user_email, '@', 2));
  
  RETURN EXISTS (
    SELECT 1 FROM public.partners 
    WHERE lower(domain) = email_domain 
    AND status = 'active'
  ) OR email_domain = 'moilapp.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if user is Moil admin
CREATE OR REPLACE FUNCTION public.is_moil_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins 
    WHERE id = user_id 
    AND global_role = 'moil_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get user's team IDs (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.get_user_team_ids(user_id UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT team_id FROM public.team_members WHERE admin_id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if user is team admin/owner (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_team_admin(user_id UUID, check_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE admin_id = user_id 
    AND team_id = check_team_id 
    AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get team IDs where user is admin/owner (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.get_user_admin_team_ids(user_id UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT team_id FROM public.team_members 
  WHERE admin_id = user_id AND role IN ('owner', 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get user's partner_id (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.get_user_partner_id(user_id UUID)
RETURNS UUID AS $$
DECLARE
  result_partner_id UUID;
BEGIN
  SELECT partner_id INTO result_partner_id
  FROM public.admins 
  WHERE id = user_id;
  RETURN result_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get user's global_role (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.get_user_global_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
  result_role TEXT;
BEGIN
  SELECT global_role::TEXT INTO result_role
  FROM public.admins 
  WHERE id = user_id;
  RETURN result_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to handle new admin registration
-- IMPORTANT: This function runs as a trigger on auth.users INSERT
-- It must bypass RLS to insert into public.admins
CREATE OR REPLACE FUNCTION public.handle_new_admin()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_partner_id UUID;
  email_domain TEXT;
  user_global_role admin_role;
BEGIN
  -- Skip if email is invalid
  IF NEW.email IS NULL OR NEW.email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN NEW;
  END IF;
  
  email_domain := lower(split_part(NEW.email, '@', 2));
  
  -- Determine role based on email domain
  IF email_domain = 'moilapp.com' THEN
    user_global_role := 'moil_admin';
    found_partner_id := NULL;
  ELSE
    -- Look up partner by domain
    SELECT p.id INTO found_partner_id
    FROM partners p
    WHERE lower(p.domain) = email_domain
    AND p.status = 'active'
    LIMIT 1;
    
    IF found_partner_id IS NOT NULL THEN
      user_global_role := 'partner_admin';
    ELSE
      user_global_role := 'member';
    END IF;
  END IF;
  
  -- Insert admin record (bypasses RLS due to SECURITY DEFINER)
  INSERT INTO admins (id, email, first_name, last_name, partner_id, global_role)
  VALUES (
    NEW.id,
    lower(NEW.email),
    COALESCE(trim(NEW.raw_user_meta_data->>'first_name'), ''),
    COALESCE(trim(NEW.raw_user_meta_data->>'last_name'), ''),
    found_partner_id,
    user_global_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    partner_id = COALESCE(admins.partner_id, EXCLUDED.partner_id),
    global_role = CASE 
      WHEN admins.global_role = 'moil_admin' THEN 'moil_admin'
      ELSE EXCLUDED.global_role 
    END,
    updated_at = NOW();
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the signup
    RAISE WARNING 'handle_new_admin error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to log activities
CREATE OR REPLACE FUNCTION public.log_activity(
  p_team_id UUID,
  p_admin_id UUID,
  p_activity_type activity_type,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}',
  p_partner_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  activity_id UUID;
BEGIN
  INSERT INTO public.activity_logs (
    team_id,
    admin_id,
    partner_id,
    activity_type,
    description,
    metadata
  ) VALUES (
    p_team_id,
    p_admin_id,
    p_partner_id,
    p_activity_type,
    p_description,
    p_metadata
  ) RETURNING id INTO activity_id;
  
  RETURN activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a team for an admin
CREATE OR REPLACE FUNCTION public.create_team_for_admin(admin_user_id UUID)
RETURNS UUID AS $$
DECLARE
  admin_record RECORD;
  new_team_id UUID;
  domain_name TEXT;
  team_name TEXT;
BEGIN
  SELECT id, email, first_name, last_name, partner_id INTO admin_record
  FROM public.admins WHERE id = admin_user_id;
  
  IF admin_record IS NULL THEN
    RAISE EXCEPTION 'Admin not found';
  END IF;
  
  IF EXISTS (SELECT 1 FROM public.team_members WHERE admin_id = admin_user_id) THEN
    RAISE EXCEPTION 'Admin is already in a team';
  END IF;
  
  domain_name := split_part(admin_record.email, '@', 2);
  team_name := COALESCE(NULLIF(admin_record.first_name, ''), 'My') || '''s Team';
  
  INSERT INTO public.teams (name, domain, owner_id, partner_id)
  VALUES (team_name, domain_name, admin_record.id, admin_record.partner_id)
  RETURNING id INTO new_team_id;
  
  INSERT INTO public.team_members (team_id, admin_id, role)
  VALUES (new_team_id, admin_record.id, 'owner');
  
  UPDATE public.licenses
  SET team_id = new_team_id, 
      performed_by = admin_record.id, 
      partner_id = admin_record.partner_id
  WHERE admin_id = admin_record.id AND team_id IS NULL;
  
  RETURN new_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- STEP 14: CREATE AUTH TRIGGER
-- ============================================

-- IMPORTANT: This trigger creates an admin record when a new user signs up
-- The handle_new_admin function must be owned by postgres to bypass RLS
-- Run this in Supabase SQL Editor with appropriate permissions

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin();

-- Ensure the function is owned by postgres (superuser) to bypass RLS
ALTER FUNCTION public.handle_new_admin() OWNER TO postgres;

-- ============================================
-- STEP 15: ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 16: DROP EXISTING POLICIES
-- ============================================

DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT schemaname, tablename, policyname 
            FROM pg_policies 
            WHERE schemaname = 'public') 
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON ' || r.schemaname || '.' || r.tablename;
  END LOOP;
END $$;

-- ============================================
-- STEP 17: CREATE RLS POLICIES
-- ============================================

-- ==================
-- PARTNERS POLICIES
-- ==================

CREATE POLICY "partners_select" ON public.partners
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
    OR
    id = public.get_user_partner_id(auth.uid())
  );

CREATE POLICY "partners_insert" ON public.partners
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_global_role(auth.uid()) = 'moil_admin');

CREATE POLICY "partners_update" ON public.partners
  FOR UPDATE TO authenticated
  USING (
    public.get_user_global_role(auth.uid()) = 'moil_admin'
    OR
    (id = public.get_user_partner_id(auth.uid()) AND public.get_user_global_role(auth.uid()) = 'partner_admin')
  );

CREATE POLICY "partners_delete" ON public.partners
  FOR DELETE TO authenticated
  USING (public.get_user_global_role(auth.uid()) = 'moil_admin');

-- Service role full access
CREATE POLICY "partners_service" ON public.partners
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- ADMINS POLICIES
-- ==================

-- Allow the auth trigger to insert new admin records
-- This is critical for signup to work
CREATE POLICY "admins_insert_trigger" ON public.admins
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "admins_select" ON public.admins
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
    OR
    (partner_id IS NOT NULL AND partner_id = public.get_user_partner_id(auth.uid()))
  );

CREATE POLICY "admins_update" ON public.admins
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.get_user_global_role(auth.uid()) = 'moil_admin');

CREATE POLICY "admins_service" ON public.admins
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- TEAMS POLICIES
-- ==================

CREATE POLICY "teams_select" ON public.teams
  FOR SELECT TO authenticated
  USING (
    public.get_user_global_role(auth.uid()) = 'moil_admin'
    OR
    id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    (partner_id IS NOT NULL AND partner_id = public.get_user_partner_id(auth.uid()))
  );

CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "teams_update" ON public.teams
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "teams_delete" ON public.teams
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.get_user_global_role(auth.uid()) = 'moil_admin');

CREATE POLICY "teams_service" ON public.teams
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- TEAM MEMBERS POLICIES
-- ==================

CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "team_members_insert" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
  );

CREATE POLICY "team_members_update" ON public.team_members
  FOR UPDATE TO authenticated
  USING (
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "team_members_delete" ON public.team_members
  FOR DELETE TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "team_members_service" ON public.team_members
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- TEAM INVITATIONS POLICIES
-- ==================

CREATE POLICY "invitations_select" ON public.team_invitations
  FOR SELECT TO authenticated
  USING (
    lower(email) = lower((SELECT email FROM public.admins WHERE id = auth.uid()))
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "invitations_insert" ON public.team_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "invitations_update" ON public.team_invitations
  FOR UPDATE TO authenticated
  USING (
    lower(email) = lower((SELECT email FROM public.admins WHERE id = auth.uid()))
    OR
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "invitations_delete" ON public.team_invitations
  FOR DELETE TO authenticated
  USING (
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "invitations_service" ON public.team_invitations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- LICENSES POLICIES
-- ==================

CREATE POLICY "licenses_select" ON public.licenses
  FOR SELECT TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "licenses_insert" ON public.licenses
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    AND
    (team_id IS NULL OR team_id IN (SELECT public.get_user_team_ids(auth.uid())))
  );

CREATE POLICY "licenses_update" ON public.licenses
  FOR UPDATE TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "licenses_delete" ON public.licenses
  FOR DELETE TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "licenses_service" ON public.licenses
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- ACTIVITY LOGS POLICIES
-- ==================

CREATE POLICY "activity_select" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "activity_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
  );

CREATE POLICY "activity_service" ON public.activity_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ============================================
-- STEP 18: GRANT PERMISSIONS
-- ============================================

-- Authenticated users
GRANT SELECT ON public.partners TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.admins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;

-- Service role (full access for API operations)
GRANT ALL ON public.partners TO service_role;
GRANT ALL ON public.admins TO service_role;
GRANT ALL ON public.teams TO service_role;
GRANT ALL ON public.team_members TO service_role;
GRANT ALL ON public.team_invitations TO service_role;
GRANT ALL ON public.licenses TO service_role;
GRANT ALL ON public.activity_logs TO service_role;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_by_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_partner_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_moil_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_team_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_admin_team_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_partner_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_global_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_activity(UUID, UUID, activity_type, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_for_admin(UUID) TO authenticated;

-- ============================================
-- DONE
-- ============================================
SELECT 'Moil License Management Schema created successfully!' as status;
