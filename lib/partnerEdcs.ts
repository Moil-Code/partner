import partnerEdcsData from './partnerEdcs.json';

export interface EdcFeatures {
  jobPosts: number;
  aiCoach: boolean;
  marketResearch: boolean;
  businessTemplates: boolean;
}

export interface PartnerBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  logoUrl: string;
  logoInitial: string;
  fontFamily: string;
}

export interface PartnerEdc {
  id: string;
  name: string;
  fullName: string;
  programName: string;
  domain: string;
  city: string;
  state: string;
  country: string;
  branding: PartnerBranding;
  supportEmail: string;
  licenseDuration: string;
  features: EdcFeatures;
  // Legacy flat properties for backward compatibility
  primaryColor?: string;
  accentColor?: string;
  logo?: string;
  logoInitial?: string;
}

export const partnerEdcs: PartnerEdc[] = partnerEdcsData.partners as PartnerEdc[];

/**
 * Get a partner EDC by admin email domain
 */
export function getEdcByEmail(email: string): PartnerEdc | undefined {
  const domain = email.split('@')[1];
  return partnerEdcs.find(edc => edc.domain === domain);
}

/**
 * Get the default EDC (Moil Partners)
 */
export function getDefaultEdc(): PartnerEdc {
  return partnerEdcs[0];
}
