# FRAM DESIGN

Building and launching products. iOS apps, AI agents, and innovative solutions.

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```

4. Configure your environment variables in `.env.local`:
   - `NEXT_PUBLIC_GA_MEASUREMENT_ID`: Your Google Analytics 4 Measurement ID
   - `RESEND_API_KEY`: Your Resend API key for email functionality
   - `GOOGLE_GENAI_API_KEY`: Google Generative AI API key
   - `OPENAI_API_KEY`: OpenAI API key

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### Production Build

```bash
npm run build
npm start
```

## Deployment

### Railway Deployment

This project consists of two services that can be deployed to Railway:

1. **Voice Server** - WebSocket server for Gemini Live API
2. **Next.js Application** - Main website application

For complete deployment instructions, see:
- **[RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)** - Comprehensive deployment guide
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Step-by-step deployment checklist
- **[voice-server/RAILWAY_DEPLOYMENT.md](./voice-server/RAILWAY_DEPLOYMENT.md)** - Voice server specific guide

**Quick Start:**

```bash
# Deploy Voice Server
cd voice-server
../scripts/Deployment/prod/deploy-voice-server.sh  # Or follow manual steps in RAILWAY_DEPLOYMENT.md

# Deploy Next.js App
railway init
railway link
railway variables set NEXT_PUBLIC_VOICE_SERVER_URL="wss://your-voice-server.up.railway.app"
railway up
```

**Environment Variables:**

- See `.env.example` for required variables
- See `voice-server/.env.example` for Voice Server variables
- All secrets should be set in Railway dashboard or via `railway variables set`

## Analytics Setup

This project uses Google Analytics 4 (GA4) to track website visitors and user behavior.

### Setting Up Google Analytics 4

1. **Create a Google Analytics Account** (if you don't have one):
   - Go to [https://analytics.google.com/](https://analytics.google.com/)
   - Sign in with your Google account
   - Click "Start measuring"

2. **Create a GA4 Property**:
   - Enter your account name
   - Configure account settings
   - Create a property (choose "Web" as platform)
   - Enter your website details

3. **Get Your Measurement ID**:
   - After creating the property, you'll see your Measurement ID (format: `G-XXXXXXXXXX`)
   - Copy this ID

4. **Add to Your Environment**:
   - Add the Measurement ID to your `.env.local` file:
     ```
     NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
     ```
   - Restart your development server

5. **Verify Installation**:
   - Visit your website
   - Open Google Analytics
   - Go to Reports → Realtime
   - You should see your visit in real-time

### What Analytics Tracks

- **Page Views**: Every page visited on your site
- **User Sessions**: Unique visitor sessions
- **Traffic Sources**: Where visitors come from (direct, search, social, etc.)
- **User Demographics**: Location, device type, browser, etc.
- **Engagement Metrics**: Time on page, bounce rate, etc.
- **Custom Events**: Any custom events you configure

### Viewing Daily Visitors

To view daily visitor statistics:

1. Go to [Google Analytics](https://analytics.google.com/)
2. Select your property
3. Navigate to **Reports → Life Cycle → Acquisition → Traffic acquisition**
4. Or go to **Reports → Realtime** for live visitor data
5. Use the date picker to select custom date ranges
6. Export data as needed (CSV, PDF, Google Sheets)

### Privacy Considerations

- GA4 is GDPR compliant when configured correctly
- Consider adding a cookie consent banner for EU visitors
- You can enable IP anonymization in GA4 settings
- Review Google's data processing terms

## Tech Stack

- **Framework**: Next.js 16
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Analytics**: Google Analytics 4
- **AI**: Google Generative AI, OpenAI
- **Email**: Resend
- **Diagrams**: Mermaid

## License

Private repository - All rights reserved.
