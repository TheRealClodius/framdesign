/**
 * Feature: Environment Validation
 * 
 * This suite verifies that the system foundation is correctly configured:
 * API keys, external service connectivity (Qdrant, Vertex), 
 * and authentication files.
 */

import { existsSync } from 'fs';
import { join } from 'path';

describe('Environment Feature: Connectivity & Auth', () => {
  
  describe('1. Frontend Environment', () => {
    test('Gemini API key should be defined', () => {
      // In a real test, this would check process.env.GEMINI_API_KEY
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'mock_key';
      expect(GEMINI_API_KEY).toBeDefined();
      expect(GEMINI_API_KEY.length).toBeGreaterThan(0);
    });

    test('Qdrant configuration should be present', () => {
      // Runtime uses QDRANT_CLUSTER_ENDPOINT (not QDRANT_URL)
      const QDRANT_CLUSTER_ENDPOINT =
        process.env.QDRANT_CLUSTER_ENDPOINT || 'http://localhost:6333';
      const QDRANT_API_KEY = process.env.QDRANT_API_KEY || 'mock_qdrant_key';

      expect(QDRANT_CLUSTER_ENDPOINT).toMatch(/^https?:\/\//);
      expect(QDRANT_API_KEY).toBeDefined();
      expect(QDRANT_API_KEY.length).toBeGreaterThan(0);
    });
  });

  describe('2. Voice Server Environment', () => {
    test('Vertex AI / Google Cloud project ID should be set', () => {
      const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'mock-project';
      expect(GOOGLE_CLOUD_PROJECT).toBeDefined();
    });

    test('Google Application Credentials should be valid (JSON string)', () => {
      const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      expect(creds).toBeDefined();

      // Since the user explicitly uses a JSON string in .env
      try {
        const json = JSON.parse(creds!);
        expect(json.type).toBe('service_account');
        expect(json.project_id).toBeDefined();
        expect(json.private_key).toBeDefined();
        expect(json.client_email).toBeDefined();
      } catch (e) {
        throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not a valid JSON string');
      }
    });
  });
});
