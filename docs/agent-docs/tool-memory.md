How agent system is structured to allow agent to understand past turns in more depth: 

Example: 

Turn I.
1. User sends a prompt to the agent
2. Agent received user prompt, together with the
---- system prompt
---- tool descriptions
---- tool schemas (need to verify, not sure of this)
---- conversation history
-------- conversation history is made up by multiple Q&A pairs and after a certain threshold, it also includes a compacted description of older messages
3. Agent decides that it needs to
---- Use Tool A and executes: IN (args) > OUT (tool A full response)
---- Use Tool B and executes: IN (args) > OUT (tool B full response)
---- Use Tool C and executes: IN (args) > OUT (tool C full response)
4. Agent sends a final response to user

Turn II is similar and currently the agent only has visibility in the past Q&A pairs but does not know what the execution loop looked like and what tools it has already used in the past, why and their effect. This makes the agent currently use tools for very simple questions and also reuse the same tools multiple times, even if maybe a previous tool response already included the answer. This makes agent responses unnecessarily slow.

What I am thinking:
- what if we either cache locally the execution data, or embed it async in the background and send it to qdrant?
- what if we give agent the ability to use one of the turn steps to get past tool executions or past tool responses?
- thinking of 
A. store the tool execution as:
[
    {agent reason for using tool A}+{tool A name}+{tool A full response}
    {agent reason for using tool B}+{tool B name}+{tool B full response}
    {agent reason for using tool C}+{tool C name}+{tool C full response}
]
(let's refer to this as [full tool array])
B. create (with aggressive token budgets) and inject in the context stack for next turn an array from the previous turn an array like this:
[
    {agent reason for using tool A}+{tool A name}+{tool A response summary}
    {agent reason for using tool B}+{tool B name}+{tool B response summary}
    {agent reason for using tool C}+{tool C name}+{tool C response summary}
]
(let's refer to this as [tool summary array])
C. only inject [tool summary array] from the previous turnm but store all [full tool arrays] for THIS session. We set an expiration timer for when we should clean the local storage of tool arrays, we don't just let them linger. it's just useful for this session.
D. let agent ask for full tool responses for any of the tools in the stored array and/or older tool summary arrays. agent should be able to filter and only ask for a list of tools used in this session, without the need to get everything.

Now, the agent would be able to not use tools constantly, because it already sees the previous steps and also has expanded output in storage that it can use very quickly. it will not keep performing tool calls with the same querries because it already has info that it accumulated, it can get more if it needs to. the expectation is that agent will be overall smarter and faster. 
