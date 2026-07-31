**TechMart Enterprise Voice Agent: Building a Sovereign AI Voice Support System for Indian Telecom**


![TechMart Enterprise Voice Agent Architecture](/assets/blog-images/telephony_architecture.png)



**GitHub:** <https://github.com/Platformatory/techmart_telephony_ai>

# **Introduction**

Customer support has long been a bottleneck for e-commerce operations at scale. Long hold times, inconsistent resolution quality, and the operational cost of scaling human agents linearly with call volume are problems every consumer-facing business eventually confronts. The TechMart Enterprise Voice Agent was built to address this directly by offering a real-time, telephony-native AI agent capable of handling customer support calls end-to-end, in multiple native Indian languages, without a human in the loop unless explicitly required. This post walks through the reasoning behind the system, the problems it solves, the architectural decisions made along the way, the trade-offs we accepted, and where the project is headed next.

# **Abbreviations**

| Abbreviation | Full Form                            |
|--------------|--------------------------------------|
| BM25         | Best Matching 25                     |
| CMS          | Content Management System            |
| CPaaS        | Communications Platform as a Service |
| CRM          | Customer Relationship Management     |
| FAQ          | Frequently Asked Questions           |
| HTTP         | Hypertext Transfer Protocol          |
| IVR          | Interactive Voice Response           |
| LLM          | Large Language Model                 |
| STT          | Speech-to-Text                       |
| TTFB         | Time-To-First-Byte                   |
| TTS          | Text-to-Speech                       |
| VAD          | Voice Activity Detection             |

# **About**

The TechMart Voice Agent is a voice AI system that bridges live telephone calls to a stateful, tool-calling LLM core. A caller dials a number, is greeted by the AI, and can ask about orders, products, policies, or file a complaint all through natural, low-latency conversation. The system runs on Vobiz.ai for telecom transport, Pipecat for real-time audio orchestration, LangGraph for conversational reasoning, and Sarvam AI for Indian-language speech services, backed by a ClickHouse-hosted vector and relational data layer.

# **Technology Stack**

| **Layer**              | **Technology**                           | **Role**                                                           | **Justification**                                                                                                                               |
|------------------------|------------------------------------------|--------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| API & Orchestration    | FastAPI                                  | Hosts webhooks, WebSocket endpoints, and the Admin CMS             | Native async support required for concurrent WebSocket audio streams without blocking                                                           |
| Telecom Transport      | Vobiz.ai                                 | Bridges live phone calls to WebSocket audio streams                | India-hosted telecom provider; lower per-minute cost than prior alternative at scale                                                            |
| Audio Pipeline         | Pipecat-AI                               | Real-time voice orchestration: VAD, turn-taking, barge-in          | Purpose-built framework for real-time voice pipelines; avoids reimplementing solved audio-concurrency problems                                  |
| Reasoning Core         | LangGraph & LangChain                    | Stateful, tool-calling conversational agent                        | Typed, checkpointed state machine required for auditable, multi-turn tool execution which are generally not available in flow-builder platforms |
| Primary LLM            | Groq (llama-3.3-70b-versatile)           | Main reasoning and response generation                             | Low-latency inference required to stay within phone-call response tolerances                                                                    |
| Summary LLM            | Groq (llama-3.1-8b-instant)              | Memory summarization and ticket generation                         | Smaller model sufficient for low latency summarization, reducing cost                                                                           |
| Speech Services        | Sarvam AI (saaras:v3, bulbul:v3)         | Native Indian-language STT and TTS                                 | India-hosted; native support for Indian dialects without a separate translation layer                                                           |
| Vector & Relational DB | ClickHouse                               | Hybrid fuzzy string + vector search, CRM, order and ticket storage | Single engine supports both fast analytical queries and vector similarity search, avoiding a separate vector-DB dependency                      |
| Local Embeddings       | Sentence-Transformers (all-MiniLM-L6-v2) | CPU-bound embedding generation for search                          | Local inference removes external embedding-API latency and dependency                                                                           |
| Observability          | Langfuse                                 | Full trace logging of reasoning and tool execution                 | Required for post-hoc interpretability of autonomous tool-calling decisions                                                                     |
| Testing                | Pytest                                   | Automated API and graph-logic validation                           | Standard, mature framework for both unit and async integration testing                                                                          |

# **Purpose**

The core purpose of this project was to build a support agent that behaves less like a scripted IVR system and more like a competent, empathetic human agent. The core functionalities aimed for were:

- Understands unstructured, natural speech in multiple Indian languages and dialects

- Retrieves accurate, grounded information from company data rather than hallucinating

- Maintains conversational memory across a multi-turn phone call

- Knows the boundary of its own authority and hands off to a human when required

- Does all of this within the latency tolerances of a live phone call, where even a one-second delay is perceptible and disruptive

# **Core Problems**

Several different problems had to be solved simultaneously for this system to be viable:

1.  **Latency under real-time constraints**. Unlike chat-based AI, a phone call has no tolerance for typing indicators or thinking pauses. STT, reasoning, tool execution, and TTS all have to happen inside a window the human ear perceives as a natural pause.

2.  **Grounding and hallucination control**. A support agent that invents a return policy or misquotes a product price is worse than no agent at all. Responses about orders, products, policies or any other queries must be derived from verified data, not from the model memory.

3.  **Multilingual support without added latency**. India's customer base speaks across a dozen major languages. Running a separate translation layer before and after the LLM call would double round-trip latency.

4.  **Turn-taking and interruption handling**. Real conversations involve interruptions, backchannel words (for example: "yes", "okay"), and overlapping speech. A naive system either talks over the user or gets derailed by every murmur.

5.  **Secure, scoped data access**. The agent must only ever access the calling customer's own data, never another customer's order history or personal information. This is non-trivial precisely because the LLM autonomously selects which tool to invoke and the system must structurally prevent it from controlling whose data that tool accesses.

6.  **Data sovereignty and geopolitical dependency**. A significant architectural concern was avoiding dependency on foreign-hosted AI infrastructure. Recent events such as a U.S. export-control action temporarily suspending access to certain frontier models for customers outside the U.S. demonstrated that AI services hosted and governed under a single foreign jurisdiction can become unavailable overnight due to policy decisions entirely outside a business's control. For a customer facing support system, this is an unacceptable single point of failure. The project was therefore built with a long-term commitment to Indian-hosted and Indian-governed infrastructure wherever viable, so that continuity of service is not dependent on the regulatory posture of another country.

# **Why Not a Ready-Made Platform (Plivo, Exotel AI Studio, and Similar)**

Several CPaaS providers now offer bundled conversational-AI layers atop their telecom infrastructure. These were evaluated and deliberately not adopted, for three technical reasons:

- Transport-layer providers do not offer reasoning-layer control. Bundled AI Studio products are typically flow-builders or fixed prompt templates over a third-party LLM. They do not expose a typed, checkpointed state machine, custom tool binding against a proprietary hybrid search layer, or state-level security guarantees such as server-side identity injection, where sensitive identifiers like customer IDs are injected directly by the framework at the tool-execution layer, invisible to and unmodifiable by the LLM. Hence, no identity injection can be done by the caller from his side, as the identity is locked by the server based on the caller’s phone number. Our requirement was a fully owned and extensible reasoning core, not an AI feature layered onto a call-routing product. Vobiz is used strictly for telecom transport only.

- Data sovereignty cannot be delegated to a third-party integration. Bundled AI layers route conversation data through the provider's own backend LLM integrations, typically foreign hosted, with no visibility or control over data flow. Owning the reasoning layer means every provider in the chain is a deliberate, auditable choice, and any single one can be swapped out without touching the rest of the system. The planned future migration from Groq's models to Sarvam's LLM is a direct example of this.

- Bundled pricing compounds cost at scale. Some products charge a markup on both the telecom leg and the AI leg as a single resold unit. Decoupling transport (Vobiz) from reasoning (self-hosted LangGraph core) eliminates this intermediary margin, leaving only raw call minutes and direct LLM cost.

In summary, ready to use platforms optimize for rapid demonstration, not for organizations requiring ownership of grounding data, security guarantees, and infrastructure jurisdiction.

# **The Core Dilemma**

The central tension in this project can be summarized as a conflict between reasoning capability and real-time responsiveness. The most capable reasoning models are also the slowest to respond, and the most reliable data retrieval methods (multi-step, exhaustive search) are also the most latency-expensive. Every architectural decision in this system is a negotiation between these two forces. The central question was to answer "How do we get a large language model to reason well over structured and unstructured company data, execute tool calls, and produce a spoken response, all while a human is holding a phone to their ear waiting for a reply?" A secondary dilemma sits underneath this: control versus autonomy. A conversational agent needs enough autonomy to handle open-ended requests, but a support agent handling real customer accounts needs hard, non-negotiable guardrails. It must never be able to act outside its authorized scope, regardless of what the conversation or the model's own reasoning suggests.

# **Conceptual Solutions**

To resolve these dilemmas, the following conceptual approaches were adopted:

- **Streaming everything**. Rather than waiting for a complete LLM response before speaking, the system streams tokens directly into the TTS engine as they are generated, and plays a language-appropriate filler phrase (for example, "Just a moment..." in English, or "एक सेकंड..." in Hindi) only if the model takes longer than 1.5 seconds to respond, thus masking latency rather than eliminating it.

- **Retrieval over recall**. All factual claims about products, policies, and orders are retrieved live from a database at inference time via tool calls, rather than relying on the model's parametric memory.

- **Hybrid search instead of pure vector search**. Two independent searches run side by side on every query: a fuzzy string-matching search that catches typos and partial word matches (this measures how similar two strings look character-by-character, unlike traditional keyword search methods like BM25, which just check whether the same words appear), and a vector similarity search that catches results that mean the same thing even when worded differently. The two ranked result lists are then merged using Reciprocal Rank Fusion which is a simple technique that combines rankings from multiple searches into a single, more reliable ranking. This catches more relevant results than either search could alone, without needing a larger, slower model.

- **Native multilingual generation instead of translation pipelines**. Sarvam AI's STT engine transcribes the caller's speech directly into native-language text (Hindi, Tamil, Kannada, and so on), which is passed to the LLM without any intermediate translation step. The LLM is instructed to write its tool call arguments in English, since the database schema requires English values, while writing its actual spoken reply in the caller's detected language; that reply is then synthesized back to audio by Sarvam AI's TTS engine. This removes an entire round-trip of translation latency that a pipeline approach would require.

- **State-level security instead of prompt-level trust**. Rather than trusting the LLM to correctly supply a customer ID in a tool call, sensitive identifiers are injected directly into the tool execution at the LangGraph ToolNode layer via LangGraph's InjectedState mechanism, invisible to and unmodifiable by the model.

- **Sovereign infrastructure by default**. Preferring Indian-hosted and Indian-operated services for every layer of the stack that touches customer data or is critical to uptime, rather than defaulting to the most well-known global provider.

# **The Core Architectural Decision**

The single most consequential decision in this project was to decouple the conversational "brain" from the audio transport layer entirely, using LangGraph as a swappable reasoning engine, built to look like an ordinary LLM service to the audio pipeline, even though a full agent is running underneath. Concretely: the audio pipeline (built on Pipecat) has no awareness that its "LLM" is actually a full LangGraph state machine with eight bound tools, a rolling memory summarizer, and a checkpointer. It only sees something that looks like an OpenAI-compatible chat service. This was achieved by subclassing Pipecat's OpenAILLMService and overriding its context-processing method to instead stream events out of a compiled LangGraph graph. This decision had several downstream benefits:

- The reasoning core (LangGraph) can be tested, iterated on, and even swapped independently of the audio stack, via a text-only tester that bypasses telephony entirely.

- Pipecat's native handling of interruption, barge-in, and TTFB metrics is inherited "for free," without reimplementing turn-taking logic inside the LangGraph layer.

- The state machine itself is a single agent that reasons, calls a tool, reads the result, and reasons again in a loop (a "ReAct" pattern), rather than a multi-agent router. This is deliberately simple, because a multi-agent architecture (a router LLM dispatching to specialist sub-agents) would have added an extra reasoning hop, and therefore latency. The task is already operating under strict latency constraints, where the primary bottleneck is response time, not computational cost, and it isn't complex enough to justify that additional overhead.

# **Security & Data Isolation**

Because the agent handles live customer accounts over the phone, the system must guarantee that a caller can never access another customer's data, regardless of how the conversation is steered. This is enforced structurally rather than through prompting:

- **Server-side identity injection**. When a call connects, the caller's phone number is verified at the telecom layer and used to look up their record. Sensitive identifiers such as customer_id are then stored in the LangGraph agent state. They are never supplied by the LLM — instead, they are injected directly into tool execution at the LangGraph ToolNode layer via LangGraph's InjectedState mechanism, so the model can request an action but cannot control whose data that action touches.

- **Explicit confirmation gates**. State-changing actions, such as filing a complaint ticket, require a two-step flow. First an eligibility check is run followed by explicit verbal confirmation from the caller before any write occurs.

- **Scoped admin access**. The Admin CMS, used to manage catalog, FAQ, and policy data, sits behind API-key authentication, independent of the customer-facing call flow. This approach treats data isolation as a property of the system's architecture, not of the model's judgment.

# **How Our Decisions Changed and Why**

Architecture is rarely right on the first attempt, and two decisions in particular evolved substantially over the course of building this system.

- Building the audio pipeline in-house, then adopting Pipecat. Our initial approach was to build the entire real-time audio pipeline ourselves manually managing the WebSocket audio stream, VAD, turn-taking logic, and the handoff between STT, LLM, and TTS stages. This consumed a disproportionate amount of engineering time relative to the value it produced, and introduced a steady stream of subtle bugs around audio buffering, race conditions between interruption events, and barge-in handling, problems that are well-understood and already solved in mature frameworks. We ultimately migrated to Pipecat-AI, a purpose-built framework for real-time voice AI pipelines. This let us inherit correct, battle-tested behavior for VAD, barge-in, and frame-based audio processing, and let our own engineering effort focus entirely on the reasoning layer.

- Migrating from Exotel to Vobiz.ai for telecom transport. The system originally used Exotel as the telephony provider bridging phone calls to our WebSocket infrastructure. After evaluating cost at projected call volumes, we migrated to Vobiz.ai, which offered materially better economics for the same core capability (bidirectional audio streaming over WebSockets with programmable call control). The interface contracts of both providers are similar enough that the migration was contained almost entirely to the transport/serialization layer, without touching the reasoning core.

# **Interpretability**

A voice AI system making autonomous decisions about tool calls, ticket filing, and human handoffs cannot be a black box. Every decision the agent makes needs to be traceable after the fact, both for debugging and for accountability when a customer disputes what happened on a call. The interpretability challenge here is compounded by the real-time nature of the system: standard debugging techniques such as breakpoints are not viable here. Pausing execution mid-call would freeze the audio stream, causing the telephony bridge to time out and drop the call entirely. Interpretability has to be achieved through structured observability rather than interactive inspection.

# **Addressing Interpretability**

These concrete mechanisms address this:

1.  **Full tracing via Langfuse**. Every graph invocation is wrapped in a Langfuse callback handler, capturing the complete chain of system prompt construction, tool calls, tool outputs, and final responses for every single turn of every call allowing a full post-hoc reconstruction of why the agent said what it said.

2.  **A structured, typed agent state**. Because the LangGraph AgentState is a strictly typed dictionary (messages, customer_profile, handoff_status, user_emotion, summary, etc.) rather than a loose blob of context, every decision point in the conversation can be inspected as a discrete, named field rather than reverse-engineered from raw text.

3.  **Non-negotiable tool boundaries** as an interpretability aid, not just a security one. Because tools like raise_complaint_ticket receive their customer_id via InjectedState rather than LLM-generated arguments, any anomaly in a ticket can be immediately attributed to either the retrieval layer or the model's reasoning, never to a spoofed or hallucinated identifier, which narrows the debugging surface considerably.

4.  **Automatic call-ticket summarization**. Every completed call is summarized into a structured ticket with an embedded vector, giving a permanent, searchable, human-readable record of what happened, independent of the raw trace logs.

In short, we trade **live interactive debugging** for **comprehensive after-the-fact tracing**, so nothing needs to pause mid-call, but everything is fully reconstructable once the call is over.

# **Scalability**

Several design choices in the current system were made specifically with horizontal scale in mind:

- **Safe concurrent database access**. ClickHouse's HTTP client breaks when multiple calls share one connection at the same time. To avoid this, each call gets its own dedicated database connection, and all database queries run on background threads, so a slow query never freezes the main event loop that's handling live call audio.

- **Stateless at the fleet level, stateful per call**. A voice call is one long-lived WebSocket connection, so once a load balancer assigns it to a FastAPI instance, it stays on that same instance for the call's entire duration. It never hops between instances mid-call. This lets that instance keep the call's conversation history in fast, local in-memory storage instead of round-tripping to a database on every turn, with only a final summary written to ClickHouse once the call ends. What makes this scale horizontally is that no instance needs any special state before a call starts: a brand-new call can be handed to any instance, including one spun up moments ago with no prior setup or state-sharing required. Scaling out is therefore just adding more identical instances behind the load balancer.

- **Pre-warming on startup**. All models (embeddings, sentiment classifier, VAD, LLM clients) are explicitly warmed up during the application lifespan startup event, ensuring the very first call handled by a newly spun-up instance is not penalized with cold-start latency. As call volume grows, the natural next steps are horizontal scaling of the FastAPI/Pipecat worker layer and a managed ClickHouse cluster with read replicas.

# **Future Enhancements**

- **Full migration to Sarvam AI's language models**. The system currently uses Groq-hosted Llama models (llama-3.3-70b-versatile for reasoning, llama-3.1-8b-instant for summarization) as the primary and background LLMs, while already using Sarvam AI for STT and TTS. The next major architectural milestone is consolidating the reasoning layer itself onto Sarvam's own Sarvam 30B/105B language models. This is a direct extension of our sovereignty principle: reducing our dependency footprint to a single, India-hosted provider across the entire voice-to-reasoning-to-voice pipeline, rather than spanning multiple providers across different jurisdictions.

- Deeper personalization via customer history. Expanding get_customer_history retrieval to proactively inform the agent's opening approach on a call, rather than only being queried reactively.

- Expanded human-handoff intelligence. Moving beyond explicit user request as the sole handoff trigger, toward confidence-based escalation when the agent's own retrieval results are weak or ambiguous.

- Multi-region ClickHouse deployment. As call volume grows across different regions of India, deploying regional ClickHouse read replicas to reduce database round-trip latency for geographically distributed calls.

# **Closing Note**

The TechMart Voice Agent was built on a simple premise: a support agent should be fast, accurate, accountable and it should not become unavailable because of a regulatory or policy decision made in a jurisdiction the business has no relationship with. Every architectural choice documented here, from the LangGraph-as-LLM-service pattern to the shift toward fully Indian-hosted infrastructure, traces back to that premise.
