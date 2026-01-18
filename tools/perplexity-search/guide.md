# perplexity_search

Search the web for real-time information using Perplexity AI. Use this tool when you need current information, recent events, or facts that may not be in the knowledge base.

## Parameters

- **query** (required): Search query or question to find real-time information (3-500 chars)

## Examples

**Current events:**
```json
{
  "query": "What are the latest developments in AI as of 2024?"
}
```
Returns current information about AI developments with citations.

**Fact checking:**
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

## Watch Out

- **API key required**: Requires `PERPLEXITY_API_KEY` environment variable to be set
- **Rate limits**: Perplexity API has rate limits. If you get rate limit errors, wait before retrying
- **Cost**: Each search uses API credits. Use sparingly and only when real-time information is needed
- **Available in both modes**: This tool works in both text and voice modes, but note that internet searches can take 5+ seconds which may impact voice conversation flow
- **Latency**: Web searches can take 2-5 seconds. Don't retry immediately on slow responses
- **Use knowledge base first**: Always try `kb_search` first for information that might be in the knowledge base
