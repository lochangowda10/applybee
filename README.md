# LaunchLoop AI

**Paste your repo. LaunchLoop figures out how to make people care.**

An autonomous AI Growth Engineer built for THE HIVE / ApplyBee AI Hackathon 2026.

## What it does

LaunchLoop is a closed-loop growth experimentation platform. Given a GitHub repository, it:

1. **Analyzes** the codebase to understand the product
2. **Generates** two fundamentally different positioning hypotheses
3. **Deploys** live landing page experiments at unique URLs
4. **Tracks** real visitor behavior (views, clicks, feedback)
5. **Learns** from results using AI analysis
6. **Iterates** by generating improved versions based on data

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your OpenAI API key

# Run development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key (or any OpenAI-compatible API) |
| `OPENAI_BASE_URL` | No | Custom API base URL (default: OpenAI) |
| `AI_MODEL` | No | Model to use (default: gpt-4o-mini) |
| `GITHUB_TOKEN` | No | GitHub token for higher API rate limits |

## Architecture

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── analyze/           # GitHub repo analysis
│   │   ├── context/           # Founder context storage
│   │   ├── positioning/       # Positioning hypothesis generation
│   │   └── experiments/       # Experiment management
│   │       ├── [experimentId]/
│   │       │   ├── events/    # Analytics tracking
│   │       │   ├── feedback/  # Visitor feedback
│   │       │   ├── learning/  # Growth intelligence
│   │       │   └── variant/   # Variant data serving
│   ├── e/                     # Live experiment pages
│   │   └── [experimentId]/
│   │       └── [variant]/
│   ├── project/               # Project management flow
│   │   └── [projectId]/
│   └── page.tsx               # Landing page
├── lib/
│   ├── ai/
│   │   ├── provider.ts        # AI API abstraction
│   │   └── analysis.ts        # All AI analysis functions
│   ├── github/
│   │   └── service.ts         # GitHub API integration
│   └── db.ts                  # SQLite database
└── components/
    └── ui/                    # shadcn/ui components
```

## Demo Mode

Without an API key, LaunchLoop runs in demo mode with mock AI responses. This is useful for testing the UI flow without API costs.

## The Loop

```
GitHub Repository
    ↓
Understand Product
    ↓
Generate Positioning Hypotheses (A vs B)
    ↓
Deploy Landing Experiments (live URLs)
    ↓
Real Visitors → Track Behavior
    ↓
AI Analysis → Learn
    ↓
Generate Version C (next iteration)
    ↓
Repeat ↺
```

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS
- **UI**: shadcn/ui
- **Database**: SQLite (better-sqlite3)
- **AI**: OpenAI-compatible API
- **GitHub**: GitHub REST API v3

## License

MIT
