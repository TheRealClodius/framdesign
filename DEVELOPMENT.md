# Development Guide

## Quick Start

### First-Time Setup

```bash
npm run setup
```

This command will:
- Install all dependencies
- Build the tool registry automatically
- Prepare the project for development

### Starting Development

```bash
npm run dev
```

This automatically builds the tool registry before starting the dev server.

### Starting Both Frontend and Voice Server

```bash
npm run dev:all
```

This starts both the Next.js frontend and the voice server concurrently.

## Common Issues

### "Internal Server Error" when sending messages

**Symptoms:**
- Error message: "FRAM Internal Server Error - ERROR: Internal Server Error. PLEASE TRY AGAIN."
- Messages fail to send to Fram

**Cause:**
- Missing `tools/tool_registry.json` file
- Missing dependencies (especially `ajv` package)

**Solution:**
```bash
npm install
npm run build:tools
```

Or simply run:
```bash
npm run setup
```

### Why does this happen?

The `tool_registry.json` file is:
- **Auto-generated** during build process
- **Not committed** to git (in `.gitignore`)
- **Required** for the chat API to function

The file needs to be rebuilt after:
- Fresh `npm install`
- Switching branches
- Pulling new changes that affect tools
- Cloning the repository

### Automatic Prevention

The following scripts now automatically build the tool registry:

1. **`postinstall`** - Runs after `npm install`
2. **`predev`** - Runs before `npm run dev`
3. **`prebuild`** - Runs before `npm run build`
4. **`prestart`** - Runs before `npm run start`

This ensures the registry is always up-to-date.

## Available Scripts

- `npm run dev` - Start development server (builds tools first)
- `npm run dev:all` - Start both frontend and voice server
- `npm run dev:clean` - Clean up existing dev servers
- `npm run dev:voice` - Start voice server only
- `npm run build` - Build for production (builds tools first)
- `npm run build:tools` - Build tool registry manually
- `npm run setup` - First-time setup (install + build tools)
- `npm run start` - Start production server (builds tools first)
- `npm run lint` - Run linter
- `npm run test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage

## Project Structure

```
framdesign/
├── app/                    # Next.js app directory
│   └── api/               # API routes
│       └── chat/          # Chat API endpoint
│           └── route.ts   # Main chat handler
├── components/            # React components
│   └── ChatInterface.tsx  # Main chat UI
├── lib/                   # Utility libraries
│   ├── errors.ts          # Error handling
│   └── services/          # Service layer
│       └── chat-service.ts # Chat service
├── tools/                 # Tool system
│   ├── _build/            # Build scripts
│   ├── _core/             # Core tool system
│   └── tool_registry.json # Generated tool registry (not in git)
└── voice-server/          # WebSocket voice server

```

## Troubleshooting

### Port Already in Use

If you get a port conflict error:

```bash
npm run dev:clean
```

This kills any existing dev servers on ports 3000 and 8080.

### Module Not Found Errors

If you see "Cannot find package" errors:

```bash
npm install
```

The `postinstall` script will automatically rebuild the tool registry.

### Tool Registry Version Mismatch

If you see tool registry version warnings:

```bash
npm run build:tools
```

This rebuilds the registry with the latest tool definitions.

## Environment Variables

Create a `.env.local` file with:

```env
GEMINI_API_KEY=your_api_key_here
```

See `.env.example` for all available variables.

## Testing

Run all tests:
```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

With coverage:
```bash
npm run test:coverage
```

## Production Build

```bash
npm run build
npm run start
```

The `prebuild` script automatically builds the tool registry before building the Next.js app.

## Git Workflow

The tool registry is not committed to git. Each developer and deployment environment builds it locally.

Files ignored by git:
- `tools/tool_registry.json` - Generated during build
- `node_modules/` - Installed dependencies
- `.env*.local` - Local environment variables
- `.lancedb/` - Database files

## Need Help?

Check the logs for detailed error messages:
- Frontend errors appear in the browser console
- Backend errors appear in the terminal running `npm run dev`
- Voice server errors appear in the voice server terminal
