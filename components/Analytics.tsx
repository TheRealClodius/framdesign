'use client';

import { GoogleAnalytics } from '@next/third-parties/google';

export default function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  // Only render analytics in production or if GA ID is explicitly set
  if (!gaId) {
    return null;
  }

  return <GoogleAnalytics gaId={gaId} />;
}
