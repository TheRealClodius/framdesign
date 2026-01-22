import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Explicitly set the workspace root to avoid Next.js detecting multiple lockfiles
  outputFileTracingRoot: path.join(__dirname),
  // Include tool registry file in serverless function output
  // This ensures tools/tool_registry.json is available at runtime in API routes
  outputFileTracingIncludes: {
    '/api/chat': ['./tools/tool_registry.json'],
  },
  async headers() {
    return [
      {
        source: "/hero-video.mp4",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
  // Externalize native packages that should be loaded at runtime by Node.js
  // This tells Next.js to not bundle these packages on the server
  // - tiktoken: requires .wasm file that must be loaded at runtime
  serverExternalPackages: ['tiktoken'],
  experimental: {
    scrollRestoration: false,
    // DISABLED: optimizePackageImports causes Next.js to hang during startup
    // on iCloud Drive due to extensive file system scanning of mermaid's large dependency tree
    // optimizePackageImports: ['mermaid', '@google/genai'],
  },
  // Use webpack explicitly for builds that need native module handling
  // Empty turbopack config to acknowledge we're using webpack intentionally
  turbopack: {},
  webpack: (config, { isServer, dev }) => {
    // Exclude markdown files from webpack processing
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });

    // Completely exclude .node native binary files from Webpack processing
    // These are native Node.js addons (like LanceDB) that must be loaded at runtime
    // We use a custom loader that returns an empty module since the actual loading
    // happens via Node.js native require at runtime
    config.module.rules.push({
      test: /\.node$/,
      type: 'asset/resource',
      generator: {
        emit: false,
      },
    });

    // Tell Webpack to not attempt to parse .node files at all
    config.module.noParse = [
      ...(config.module.noParse || []),
      /\.node$/,
    ];

    // Exclude .node files (native Node.js addons) from webpack processing
    // These are binary files that should be loaded at runtime by Node.js
    // We handle this via externals configuration below

    // For server-side, configure path resolution
    if (isServer) {
      // Configure resolve aliases to match tsconfig.json
      config.resolve.alias = {
        ...config.resolve.alias,
        '@': path.resolve(__dirname, './'),
      };

      // Allow resolving .js imports to .ts files (for dynamic imports in tools)
      config.resolve.extensionAlias = {
        '.js': ['.js', '.ts', '.tsx'],
      };
      
      // Ensure TypeScript files can be resolved
      config.resolve.extensions = [
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.json',
        ...(config.resolve.extensions || [])
      ];
      
      // Exclude tool handlers from webpack optimization to preserve ES module exports
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
      };
      
      // Configure webpack to handle dynamic imports with computed paths
      // This allows the tool registry to dynamically import handlers
      // Note: Webpack will try to bundle all possible handler imports
      // The tool registry uses relative paths like ../{tool-name}/handler.js
      
      // Ensure webpack can resolve relative paths in dynamic imports
      config.resolve.modules = [
        ...(config.resolve.modules || []),
        'node_modules',
        __dirname,
      ];
      
      // Configure webpack to handle dynamic imports more flexibly
      // This prevents webpack from throwing errors on computed import paths
      config.optimization = {
        ...config.optimization,
        // Don't try to optimize dynamic imports that use computed paths
        moduleIds: 'deterministic',
      };
      
      // Suppress webpack warning for dynamic imports in tool registry
      // All tools are statically imported via HANDLER_IMPORTS map,
      // but webpack still analyzes the fallback path and warns
      config.ignoreWarnings = [
        ...(config.ignoreWarnings || []),
        {
          module: /tools\/_core\/registry\.js/,
          message: /Critical dependency: the request of a dependency is an expression/,
        },
      ];
    }

    // Exclude server-only modules from client bundle
    if (!isServer) {
      // Prevent server-side modules from being bundled in client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
      
    }

    // Optimize compilation performance in development
    if (dev) {
      // Use memory cache instead of filesystem cache to avoid hangs on iCloud Drive
      // Memory cache is faster and doesn't require slow file system operations
      config.cache = {
        type: 'memory',
        maxGenerations: 1, // Keep only one generation to reduce memory usage
      };
      
      // Optimize module resolution
      config.resolve.symlinks = false;
      
      // Reduce file system scanning by ignoring large directories
      config.watchOptions = {
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/public/kb-assets/**', // Large asset directory
          '**/voice-server/node_modules/**',
          '**/tests/**',
          '**/scripts/**',
          '**/.cursor/**',
        ],
        aggregateTimeout: 300, // Delay rebuild after first change
        poll: false, // Disable polling on iCloud Drive (causes hangs)
      };
      
      // Reduce module resolution attempts - use simpler resolution
      config.resolve.unsafeCache = true; // Cache module resolution (faster)
      
      // Tell webpack to not try to resolve certain paths eagerly
      // This prevents webpack from scanning the entire tools directory on startup
      config.resolve.modules = [
        'node_modules',
        ...(config.resolve.modules || []).filter((m: string) => m !== __dirname),
      ];
      
      // Limit the number of files webpack processes
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false, // Don't remove modules (faster on slow FS)
        removeEmptyChunks: false, // Don't remove empty chunks (faster)
        moduleIds: 'deterministic', // Use deterministic IDs (faster)
        chunkIds: 'deterministic', // Use deterministic chunk IDs (faster)
      };
      
      // Reduce webpack's file system operations
      // Skip parsing for certain large modules that don't need it
      if (!config.module) config.module = {};
      if (!Array.isArray(config.module.noParse)) {
        config.module.noParse = [];
      }
      // Add patterns to skip parsing (webpack won't analyze these files)
      config.module.noParse.push(
        /node_modules\/mermaid/,
        /node_modules\/@google\/genai/,
      );
      
      // Reduce logging overhead
      config.infrastructureLogging = {
        level: 'error',
      };
    }

    return config;
  },
};

export default nextConfig;
