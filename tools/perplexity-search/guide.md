# perplexity_search

Search the web for real-time information using Perplexity AI. Use this when you need current facts or recent events not in the knowledge base.

## When to Use This Tool

**ALWAYS use this tool when the user asks about:**
- "Latest developments" / "recent news" / "current state of..."
- "As of [any year]" (they want current information for that time)
- Recent events, updates, statistics, prices, or facts that change over time
- Anything requiring up-to-date real-time information

**Never refuse** current-events questions. If you don’t have the information, search for it.

## Parameters

- **query** (required): Search query or question to find real-time information (3-500 chars)

## Examples

**Current developments:**
```json
{
  "query": "Latest developments in AI agents and automation"
}
```
Returns current information about AI developments with citations.

**Real-time facts:**
```json
{
  "query": "What is the current population of Tokyo?"
}
```
Returns up-to-date factual information.

**Recent news:**
```json
{
  "query": "Latest news about quantum computing breakthroughs"
}
```
Returns recent information about the topic.

**Year-specific queries:**
```json
{
  "query": "Major AI breakthroughs and trends in 2026"
}
```
When users ask about a specific year, search for information from that time period.

## Watch Out

- **API key required**: Requires `PERPLEXITY_API_KEY` environment variable to be set
- **Rate limits**: Perplexity API has rate limits. If you get rate limit errors, wait before retrying
- **Cost**: Each search uses API credits. Use sparingly and only when real-time information is needed
- **Latency**: Web searches can take 2-5 seconds. Don’t retry immediately on slow responses
- **Voice impact**: In voice mode, searches can take 5+ seconds and disrupt flow
- **Use knowledge base first**: Always try `kb_search` for Fram-related information
