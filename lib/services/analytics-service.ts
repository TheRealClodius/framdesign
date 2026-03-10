import { google } from 'googleapis';

let analyticsClient: ReturnType<typeof google.analyticsdata> | null = null;
let cachedData: { data: AnalyticsData; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface AnalyticsData {
  sessionsOverTime: Array<{ date: string; sessions: number }>;
  topCountries: Array<{ country: string; sessions: number }>;
  totalPageViews: number;
  activeUsers: number;
}

function getAnalyticsClient() {
  if (!analyticsClient) {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) throw new Error('Missing GA4_PROPERTY_ID');

    // Reuse existing GCS service account credentials
    const credentialsBase64 = process.env.GCS_SERVICE_ACCOUNT_KEY;
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    let auth;
    if (credentialsBase64) {
      const credentials = JSON.parse(Buffer.from(credentialsBase64, 'base64').toString('utf-8'));
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
      });
    } else if (credentialsPath) {
      auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
      });
    } else {
      throw new Error('Missing GCS_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS');
    }

    analyticsClient = google.analyticsdata({ version: 'v1beta', auth });
  }
  return analyticsClient;
}

export async function getAnalyticsData(): Promise<AnalyticsData> {
  // Return cached data if fresh
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return cachedData.data;
  }

  const client = getAnalyticsClient();
  const propertyId = process.env.GA4_PROPERTY_ID!;

  const [sessionsReport, countryReport] = await Promise.all([
    // Sessions over time (last 30 days)
    client.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date', orderType: 'ALPHANUMERIC' } }],
      },
    }),
    // Sessions by country
    client.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '15',
      },
    }),
  ]);

  const sessionsOverTime = (sessionsReport.data.rows || []).map((row) => ({
    date: row.dimensionValues?.[0]?.value || '',
    sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
  }));

  const topCountries = (countryReport.data.rows || []).map((row) => ({
    country: row.dimensionValues?.[0]?.value || 'Unknown',
    sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
  }));

  // Aggregate totals from the sessions report
  let totalPageViews = 0;
  let activeUsers = 0;
  for (const row of sessionsReport.data.rows || []) {
    totalPageViews += parseInt(row.metricValues?.[2]?.value || '0', 10);
    activeUsers += parseInt(row.metricValues?.[1]?.value || '0', 10);
  }

  const data: AnalyticsData = { sessionsOverTime, topCountries, totalPageViews, activeUsers };
  cachedData = { data, timestamp: Date.now() };
  return data;
}
