# Analytics Setup Guide

## Quick Start

This guide will help you set up Google Analytics 4 (GA4) to track daily website visitors.

## Step 1: Create Google Analytics Account

1. Go to [https://analytics.google.com/](https://analytics.google.com/)
2. Click **"Start measuring"** or **"Admin"** (if you already have an account)
3. Click **"Create Account"** or select existing account

## Step 2: Create a GA4 Property

1. In Admin, click **"Create Property"**
2. Enter property details:
   - **Property name**: FRAM DESIGN (or your preferred name)
   - **Reporting time zone**: Select your timezone
   - **Currency**: Select your currency
3. Click **"Next"**
4. Fill in business details (optional but recommended)
5. Click **"Create"**

## Step 3: Set Up Data Stream

1. Select **"Web"** as your platform
2. Enter your website details:
   - **Website URL**: `https://yourdomain.com` (your production URL)
   - **Stream name**: FRAM DESIGN Website
3. Click **"Create stream"**

## Step 4: Get Your Measurement ID

1. After creating the stream, you'll see the **Web stream details**
2. Look for **"Measurement ID"** at the top right
3. It will look like: `G-XXXXXXXXXX`
4. Copy this ID

## Step 5: Add to Your Project

1. Create a `.env.local` file in your project root (if it doesn't exist):
   ```bash
   cp .env.example .env.local
   ```

2. Add your Measurement ID to `.env.local`:
   ```
   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
   ```

3. Restart your development server:
   ```bash
   npm run dev
   ```

## Step 6: Verify It's Working

### Method 1: Real-Time Reports
1. Visit your website (localhost for testing or production URL)
2. Go to Google Analytics → Reports → Realtime
3. You should see your active session appear within seconds

### Method 2: Browser Console
1. Open your website
2. Open browser DevTools (F12)
3. Go to Network tab
4. Filter by "google-analytics" or "gtag"
5. You should see requests being sent

### Method 3: Google Tag Assistant (Browser Extension)
1. Install [Google Tag Assistant](https://tagassistant.google.com/)
2. Visit your website
3. The extension will show if GA4 is firing correctly

## Viewing Daily Visitor Statistics

### Dashboard Overview
1. Go to [Google Analytics](https://analytics.google.com/)
2. Select your property
3. Navigate to **Reports → Reports snapshot**
4. View overview of users, sessions, and key metrics

### Daily Visitors Report
1. Go to **Reports → Life cycle → Engagement → Overview**
2. Use the date picker (top right) to select your date range
3. View charts showing daily trends

### Detailed Traffic Reports
- **Traffic Acquisition**: Reports → Acquisition → Traffic acquisition
- **User Demographics**: Reports → User → Demographics
- **Pages and Screens**: Reports → Engagement → Pages and screens
- **Real-time Data**: Reports → Realtime

### Custom Reports
1. Go to **Explore** (left sidebar)
2. Create custom reports with:
   - Daily active users
   - Page views per day
   - Session duration
   - Bounce rate
   - Traffic sources

## Key Metrics Explained

- **Users**: Total unique visitors
- **Sessions**: Total number of visits (one user can have multiple sessions)
- **Page views**: Total number of pages viewed
- **Average session duration**: How long users stay on your site
- **Bounce rate**: Percentage of single-page sessions
- **Conversion rate**: Percentage of users who complete desired actions

## Exporting Data

1. Go to any report
2. Click the **Share** icon (top right)
3. Choose export format:
   - **PDF**: For presentations
   - **Google Sheets**: For analysis
   - **CSV**: For data processing

## Advanced Configuration (Optional)

### Enable Enhanced Measurement
1. Go to Admin → Data Streams
2. Click your web stream
3. Toggle on **Enhanced Measurement**
4. This automatically tracks:
   - Scrolls
   - Outbound clicks
   - Site search
   - Video engagement
   - File downloads

### Set Up Custom Events
You can track custom events by adding code like:

```typescript
// In your Next.js app
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
  }
}

// Track custom event
if (typeof window !== 'undefined' && window.gtag) {
  window.gtag('event', 'button_click', {
    event_category: 'engagement',
    event_label: 'contact_button',
  });
}
```

### Link to Google Search Console
1. Go to Admin → Property Settings → Product Links
2. Click **"Search Console"** → **"Link"**
3. This adds search performance data to your analytics

## Privacy & Compliance

### GDPR Compliance
- Consider adding a cookie consent banner
- Update your privacy policy
- Enable IP anonymization (enabled by default in GA4)

### Data Retention
1. Go to Admin → Data Settings → Data Retention
2. Choose retention period (default: 2 months)
3. Adjust based on your needs

## Troubleshooting

### Analytics Not Showing Data?
1. **Check environment variable**: Ensure `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set correctly
2. **Check deployment**: Environment variables must be set in production (Vercel, etc.)
3. **Wait 24-48 hours**: Initial data may take time to appear
4. **Use Realtime reports**: Check if current traffic is being tracked
5. **Check browser extensions**: Ad blockers may block analytics

### Still Not Working?
1. Check browser console for errors
2. Verify the Measurement ID format is correct (`G-XXXXXXXXXX`)
3. Ensure you're using the GA4 property (not Universal Analytics)
4. Check that analytics script is loading (view page source)

## Resources

- [GA4 Documentation](https://support.google.com/analytics/answer/9304153)
- [GA4 Reporting Guide](https://support.google.com/analytics/answer/9212670)
- [Next.js Analytics](https://nextjs.org/docs/app/building-your-application/optimizing/analytics)

## Need Help?

If you encounter issues:
1. Check the [GA4 Help Center](https://support.google.com/analytics/)
2. Review [Next.js Third Parties Documentation](https://nextjs.org/docs/app/building-your-application/optimizing/third-party-libraries)
3. Test in Realtime reports first before checking historical data
