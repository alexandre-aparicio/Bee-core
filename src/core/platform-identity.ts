export type PlatformIdentityDocument = {
  key: "global";
  brand: {
    platformName: string;
    pageTitle: string;
    tagline: string;
    description: string;
    legalName: string;
    websiteUrl: string;
    contactEmail: string;
    copyright: string;
  };
  assets: {
    primaryLogoUrl: string;
    secondaryLogoUrl: string;
    brandMarkUrl: string;
    faviconUrl: string;
    appleTouchIconUrl: string;
    socialImageUrl: string;
    loginLogoUrl: string;
  };
  seo: {
    title: string;
    description: string;
    keywords: string[];
    canonicalUrl: string;
    robotsIndex: boolean;
    robotsFollow: boolean;
    openGraphTitle: string;
    openGraphDescription: string;
    openGraphImageUrl: string;
    twitterCard: "summary" | "summary_large_image";
    twitterTitle: string;
    twitterDescription: string;
    twitterImageUrl: string;
  };
  updatedAt: Date;
  updatedBy: string;
};

export type PublicPlatformIdentity = Pick<PlatformIdentityDocument, "brand" | "assets" | "seo">;
