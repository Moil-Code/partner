'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Logo from '@/components/ui/Logo';
import { Mail, Lock, Eye, EyeOff, ArrowRight, User, ArrowLeft, Shield, Building2 } from 'lucide-react';

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  // Get invite parameters from URL
  const inviteToken = searchParams.get('invite');
  const teamId = searchParams.get('team');
  const teamName = searchParams.get('teamName');
  const redirectUrl = searchParams.get('redirect');
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extractedDomain, setExtractedDomain] = useState('');
  
  // Check if this is an invite signup
  const isInviteSignup = !!inviteToken;

  // Extract domain from email
  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (value.includes('@')) {
      const domain = value.split('@')[1];
      setExtractedDomain(domain || '');
    } else {
      setExtractedDomain('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate email format
    if (!email.includes('@')) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        type: "error"
      });
      setLoading(false);
      return;
    }

    // Validate password length
    if (password.length < 8) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 8 characters long",
        type: "error"
      });
      setLoading(false);
      return;
    }

    // Validate organization name for partner requests
    if (!isInviteSignup && (!organizationName || organizationName.trim().length < 2)) {
      toast({
        title: "Invalid Organization Name",
        description: "Please enter a valid organization name",
        type: "error"
      });
      setLoading(false);
      return;
    }

    try {
      if (isInviteSignup) {
        // Team invite signup - use Supabase auth directly
        const supabase = createClient();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              role: 'member',
            },
          },
        });

        if (signUpError) {
          toast({
            title: "Signup Failed",
            description: signUpError.message,
            type: "error"
          });
          console.error("Signup error:", signUpError);
          setLoading(false);
          return;
        }

        if (!data.user) {
          toast({
            title: "Signup Failed",
            description: "Failed to create user",
            type: "error"
          });
          setLoading(false);
          return;
        }

        toast({
          title: "Account Created",
          description: "Account created successfully! Redirecting to login...",
          type: "success"
        });

        setTimeout(() => {
          router.push(`/login?redirect=/invite/accept?token=${inviteToken}`);
        }, 2000);
      } else {
        // Partner access request flow:
        // 1. First, sign up the user with Supabase Auth
        const supabase = createClient();
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              organization_name: organizationName.trim(),
              role: 'partner_admin',
            },
          },
        });

        if (signUpError) {
          toast({
            title: "Signup Failed",
            description: signUpError.message,
            type: "error"
          });
          console.error("Signup error:", signUpError);
          setLoading(false);
          return;
        }

        if (!authData.user) {
          toast({
            title: "Signup Failed",
            description: "Failed to create user account",
            type: "error"
          });
          setLoading(false);
          return;
        }

        // 2. Then, create the partner with pending status via API
        const response = await fetch('/api/partners/request-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationName: organizationName.trim(),
            email,
            userId: authData.user.id,
          }),
        });

        const data = await response.json();
        console.log(data);

        if (data.error) {
          // Partner creation failed - show error toast
          toast({
            title: "Request Failed",
            description: data.error || "Failed to submit access request. Please try again.",
            type: "error"
          });
          console.error("Partner request error:", data.error);
          setLoading(false);
          return;
        }

        toast({
          title: "Request Submitted!",
          description: "Your partner access request has been submitted. Moil admins will review and approve your organization.",
          type: "success"
        });

        setTimeout(() => {
          if (redirectUrl) {
            router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
          } else {
            router.push('/login?message=access_requested');
          }
        }, 3000);
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        type: "error"
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center font-sans overflow-hidden bg-[var(--background)]">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[var(--primary)]/10 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-[var(--secondary)]/10 blur-[100px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10 py-12">
        <div className="w-full max-w-lg mx-auto">
          {/* Logo Section */}
          <div className="text-center mb-8 animate-fade-in">
            <Link href="/" className="inline-block group">
                <div className="flex items-center justify-center mb-4">
                    <Logo size="lg" />
                </div>
            </Link>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
              {isInviteSignup ? 'Create Account' : 'Request Partner Access'}
            </h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">
              {isInviteSignup ? 'Create your account to join the team' : 'Submit your organization details to request access'}
            </p>
          </div>

          {/* Team Invite Banner */}
          {isInviteSignup && teamName && (
            <div className="bg-gradient-to-r from-[var(--primary)] to-[var(--primary-600)] rounded-xl p-5 mb-6 text-white animate-fade-in shadow-lg border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-sm">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-sm font-medium">You're joining</p>
                  <p className="text-xl font-bold tracking-tight">{decodeURIComponent(teamName)}</p>
                  {teamId && <p className="text-white/60 text-[10px] font-mono mt-1 bg-black/20 px-1.5 py-0.5 rounded inline-block">ID: {teamId.slice(0, 8)}...</p>}
                </div>
              </div>
            </div>
          )}

          {/* Signup Card */}
          <Card variant="glass" className="border-t-4 border-t-[var(--primary)] shadow-2xl">
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                {isInviteSignup ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">First Name</label>
                      <input 
                        type="text" 
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                        placeholder="Jane"
                        required
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Last Name</label>
                      <input 
                        type="text" 
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                        placeholder="Doe"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Organization Name</label>
                    <div className="relative group">
                      <input 
                        type="text" 
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                        className="w-full px-4 py-3 pl-11 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                        placeholder="Acme Corporation"
                        required
                        disabled={loading}
                      />
                      <Building2 className="w-5 h-5 text-[var(--text-tertiary)] absolute left-3.5 top-3.5 group-focus-within:text-[var(--primary)] transition-colors" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    {isInviteSignup ? 'Work Email' : 'Email Address'}
                  </label>
                  <div className="relative group">
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      className="w-full px-4 py-3 pl-11 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                      placeholder="name@company.com"
                      required
                      disabled={loading}
                    />
                    <Mail className="w-5 h-5 text-[var(--text-tertiary)] absolute left-3.5 top-3.5 group-focus-within:text-[var(--primary)] transition-colors" />
                  </div>
                  {!isInviteSignup && extractedDomain && (
                    <p className="mt-2 text-xs text-[var(--text-secondary)] flex items-center gap-1.5 bg-[var(--surface-subtle)] px-3 py-2 rounded-lg border border-[var(--border)]">
                      <span className="font-medium">Domain:</span>
                      <code className="text-[var(--secondary)] font-mono bg-[var(--secondary)]/5 px-2 py-0.5 rounded">{extractedDomain}</code>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Create Password</label>
                  <div className="relative group">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pl-11 pr-12 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                      disabled={loading}
                    />
                    <Lock className="w-5 h-5 text-[var(--text-tertiary)] absolute left-3.5 top-3.5 group-focus-within:text-[var(--primary)] transition-colors" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                      disabled={loading}
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {!isInviteSignup && (
                  <div className="bg-[var(--primary)]/5 p-4 rounded-xl border border-[var(--primary)]/10">
                    <div className="flex gap-3">
                        <Shield className="w-5 h-5 text-[var(--primary)] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            Partner access requests require approval from Moil admins. You will receive an email once your organization has been verified and approved.
                        </p>
                    </div>
                  </div>
                )}

                <Button 
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-base shadow-lg shadow-[var(--primary)]/20"
                  loading={loading}
                >
                  {loading ? (isInviteSignup ? 'Creating Account...' : 'Submitting Request...') : (
                    <>
                      <span>{isInviteSignup ? 'Create Account' : 'Request Access'}</span>
                      <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-8 pt-6 border-t border-[var(--border)] text-center">
                <p className="text-sm text-[var(--text-secondary)]">
                  Already have an account? <Link href="/login" className="text-[var(--primary)] font-semibold hover:underline">Sign In</Link>
                </p>
              </div>
            </CardContent>
          </Card>
          
          <div className="mt-8 text-center pb-8">
            <Link href="/login" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-sm transition-colors flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                {isInviteSignup ? 'Return to Login' : 'Return to Login'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminSignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    }>
      <SignupContent />
    </Suspense>
  );
}
