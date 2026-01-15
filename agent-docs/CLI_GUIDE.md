# CLI Guide

## Railway
- **Project**: FRAMDESIGN-LIVEAPI
- **Services**: voice-service, vector-search-service
- **Auth**: ✅ Authenticated

```bash
railway link FRAMDESIGN-LIVEAPI
railway service <service-name>
railway logs
```

## Vercel
- **Project**: framdesign
- **Default**: Production (main branch → Production)
- **Auth**: ✅ Authenticated

```bash
vercel ls              # Production deployments
vercel logs <url>
```

## Google Cloud
- **Auth**: ✅ Authenticated (andrei@fram.design)
- **Key Project**: fram-design-website

```bash
gcloud projects list
gcloud config set project fram-design-website
```
