-- ============================================
-- FIX RLS INFINITE RECURSION + ADD APPROVAL TOKEN
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 0: Add approval_token column to partners table for direct email approval
ALTER TABLE public.partners 
ADD COLUMN IF NOT EXISTS approval_token TEXT UNIQUE;

COMMENT ON COLUMN public.partners.approval_token IS 'Secure token for direct email-based partner approval';

-- Step 1: Create helper functions that bypass RLS to avoid recursion

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

-- Step 2: Grant execute permissions on new functions
GRANT EXECUTE ON FUNCTION public.get_user_team_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_admin_team_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_partner_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_global_role(UUID) TO authenticated;

-- Step 3: Drop existing problematic policies
DROP POLICY IF EXISTS "team_members_select" ON public.team_members;
DROP POLICY IF EXISTS "team_members_insert" ON public.team_members;
DROP POLICY IF EXISTS "team_members_update" ON public.team_members;
DROP POLICY IF EXISTS "team_members_delete" ON public.team_members;

DROP POLICY IF EXISTS "admins_select" ON public.admins;
DROP POLICY IF EXISTS "admins_update" ON public.admins;

DROP POLICY IF EXISTS "partners_select" ON public.partners;
DROP POLICY IF EXISTS "partners_insert" ON public.partners;
DROP POLICY IF EXISTS "partners_update" ON public.partners;
DROP POLICY IF EXISTS "partners_delete" ON public.partners;

DROP POLICY IF EXISTS "teams_select" ON public.teams;
DROP POLICY IF EXISTS "teams_insert" ON public.teams;
DROP POLICY IF EXISTS "teams_update" ON public.teams;
DROP POLICY IF EXISTS "teams_delete" ON public.teams;

DROP POLICY IF EXISTS "invitations_select" ON public.team_invitations;
DROP POLICY IF EXISTS "invitations_insert" ON public.team_invitations;
DROP POLICY IF EXISTS "invitations_update" ON public.team_invitations;
DROP POLICY IF EXISTS "invitations_delete" ON public.team_invitations;

DROP POLICY IF EXISTS "licenses_select" ON public.licenses;
DROP POLICY IF EXISTS "licenses_insert" ON public.licenses;
DROP POLICY IF EXISTS "licenses_update" ON public.licenses;
DROP POLICY IF EXISTS "licenses_delete" ON public.licenses;

DROP POLICY IF EXISTS "activity_select" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_insert" ON public.activity_logs;

-- Step 4: Recreate policies using helper functions

-- PARTNERS POLICIES (fixed to use helper functions)
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

-- TEAM MEMBERS POLICIES (fixed to avoid recursion)
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

-- ADMINS POLICIES (fixed to avoid recursion)
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

-- TEAMS POLICIES (fixed to use helper function)
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

-- TEAM INVITATIONS POLICIES (fixed to use helper functions)
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

-- LICENSES POLICIES (fixed to use helper functions)
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

-- ACTIVITY LOGS POLICIES (fixed to use helper functions)
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

SELECT 'RLS recursion fix applied successfully!' as status;
