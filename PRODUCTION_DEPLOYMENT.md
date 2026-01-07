# Production Deployment Guide - Analytics Setup

## Quick Overview

Your analytics code is already implemented and ready! You just need to add the environment variable to your production hosting platform.

## Step-by-Step Instructions by Platform

### 🚀 Vercel (Most Common for Next.js)

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com) and sign in
   - Select your project

2. **Add Environment Variable**
   - Click on **Settings** tab
   - Click **Environment Variables** in the left sidebar
   - Click **Add New**
   - Enter:
     - **Name**: `NEXT_PUBLIC_GA_MEASUREMENT_ID`
     - **Value**: `G-STMMVNTFVZ`
     - **Environment**: Select all (Production, Preview, Development)
   - Click **Save**

3. **Redeploy**
   - Go to **Deployments** tab
   - Click the **⋯** (three dots) on your latest deployment
   - Click **Redeploy**
   - Or push a new commit to trigger automatic deployment

4. **Verify**
   - Visit your production URL
   - Open Google Analytics → Reports → Realtime
   - You should see your visit appear!

---

### 🌐 Netlify

1. **Go to Netlify Dashboard**
   - Visit [netlify.com](https://netlify.com) and sign in
   - Select your site

2. **Add Environment Variable**
   - Click **Site configuration** → **Environment variables**
   - Click **Add a variable**
   - Enter:
     - **Key**: `NEXT_PUBLIC_GA_MEASUREMENT_ID`
     - **Value**: `G-STMMVNTFVZ`
     - **Scopes**: Select all (Production, Deploy previews, Branch deploys)
   - Click **Save**

3. **Redeploy**
   - Go to **Deploys** tab
   - Click **Trigger deploy** → **Deploy site**
   - Or push a new commit

4. **Verify**
   - Visit your production URL
   - Check Google Analytics Realtime reports

---

### 🐳 Docker / Self-Hosted

1. **Update your `.env` or `.env.production` file:**
   ```bash
   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-STMMVNTFVZ
   ```

2. **Or set as environment variable:**
   ```bash
   export NEXT_PUBLIC_GA_MEASUREMENT_ID=G-STMMVNTFVZ
   ```

3. **Rebuild and restart:**
   ```bash
   npm run build
   npm start
   ```

---

### ☁️ AWS / Azure / GCP

#### AWS (Amplify, Elastic Beanstalk, EC2)

**AWS Amplify:**
1. Go to AWS Amplify Console
2. Select your app → **Environment variables**
3. Add: `NEXT_PUBLIC_GA_MEASUREMENT_ID` = `G-STMMVNTFVZ`
4. Save and redeploy

**Elastic Beanstalk:**
1. Go to Elastic Beanstalk Console
2. Select your environment → **Configuration** → **Software**
3. Add environment property: `NEXT_PUBLIC_GA_MEASUREMENT_ID` = `G-STMMVNTFVZ`
4. Apply changes

**EC2 / ECS:**
- Set environment variable in your deployment script or container config
- Restart your application

#### Azure App Service:
1. Go to Azure Portal → Your App Service
2. **Configuration** → **Application settings**
3. Click **+ New application setting**
4. Name: `NEXT_PUBLIC_GA_MEASUREMENT_ID`, Value: `G-STMMVNTFVZ`
5. Click **Save**

#### Google Cloud Platform:
1. Go to Cloud Console → Cloud Run / App Engine
2. **Configuration** → **Environment variables**
3. Add: `NEXT_PUBLIC_GA_MEASUREMENT_ID` = `G-STMMVNTFVZ`
4. Deploy new revision

---

### 🐙 GitHub Pages / Static Hosting

For static exports, you'll need to:

1. **Build with environment variable:**
   ```bash
   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-STMMVNTFVZ npm run build
   ```

2. **Or use a build script** that sets the variable before building

3. **Deploy the `out` folder** to your static host

---

## Important Notes

### ✅ Environment Variable Name
- Must be exactly: `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- The `NEXT_PUBLIC_` prefix is required for Next.js to expose it to the browser

### ✅ Measurement ID
- Your ID: `G-STMMVNTFVZ`
- Keep this secure (don't commit to public repos)

### ✅ After Adding the Variable

1. **Redeploy your application** (required for changes to take effect)
2. **Clear your browser cache** if testing
3. **Wait 1-2 minutes** for the new deployment to be live
4. **Test using Google Analytics "Test installation" tool**

---

## Verification Checklist

After deployment, verify:

- [ ] Environment variable is set in production
- [ ] Application has been redeployed
- [ ] Visit your production URL
- [ ] Open browser DevTools → Network tab
- [ ] Filter by "google-analytics" or "gtag"
- [ ] You should see requests to `googletagmanager.com`
- [ ] Go to Google Analytics → Realtime reports
- [ ] Your visit should appear within seconds

---

## Troubleshooting

### Analytics Not Working in Production?

1. **Check Environment Variable:**
   - Verify it's set correctly in your hosting platform
   - Make sure it's available in Production environment (not just Development)

2. **Check Deployment:**
   - Ensure you redeployed after adding the variable
   - Check deployment logs for any errors

3. **Verify Variable Name:**
   - Must start with `NEXT_PUBLIC_` for Next.js
   - Case-sensitive: `NEXT_PUBLIC_GA_MEASUREMENT_ID`

4. **Check Browser Console:**
   - Open DevTools → Console
   - Look for any errors related to Google Analytics
   - Check Network tab for failed requests

5. **Test in Incognito:**
   - Ad blockers or extensions might block analytics
   - Test in incognito/private mode

6. **Wait Time:**
   - Sometimes takes 5-10 minutes for changes to propagate
   - Check again after waiting

---

## Quick Reference

**Environment Variable:**
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-STMMVNTFVZ
```

**What It Does:**
- Enables Google Analytics tracking on your production site
- Tracks visitors, page views, and user behavior
- Provides real-time and historical analytics data

**Where to View Data:**
- [Google Analytics Dashboard](https://analytics.google.com/)
- Reports → Realtime (for live data)
- Reports → Engagement (for daily visitors)

---

## Need Help?

If you're still having issues:
1. Check your hosting platform's documentation for environment variables
2. Verify the variable is set correctly (no extra spaces, correct name)
3. Ensure you've redeployed after adding the variable
4. Check Google Analytics Help Center for troubleshooting
