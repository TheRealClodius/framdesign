# perplexity_search

Search the web for real-time information using Perplexity AI. Use this tool when you need current information, recent events, or facts that may not be in the knowledge base.

## When to Use This Tool

**ALWAYS use this tool when the user asks about:**
- "Latest developments" or "recent news" in any field
- "What's happening with..." or "current state of..."
- "As of [any year]" - this phrasing means they want CURRENT information
- Recent events, news, or updates beyond your training data
- Current statistics, prices, or facts that change over time
- Anything requiring up-to-date real-time information

**Key insight:** When a user asks "What are the latest developments in AI as of 2026?", they are requesting CURRENT real-time information. The year indicates they want information current to that date, not a prediction about the future. Use this tool to provide accurate, cited answers.

**DO NOT refuse to answer** questions about current events or recent developments. If you don't have the information, use this tool to search for it.

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
- **Available in both modes**: This tool works in both text and voice modes, but note that internet searches can take 5+ seconds which may impact voice conversation flow
- **Latency**: Web searches can take 2-5 seconds. Don't retry immediately on slow responses
- **Use knowledge base first**: Always try `kb_search` first for information that might be in the knowledge base
- **Never refuse current events queries**: If a user asks about recent/current information, always use this tool rather than refusing to answer
