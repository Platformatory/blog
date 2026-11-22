---
layout: post
title: 'Old Wine on the Stream: What Agents Really Change in Streaming'
author: p6
categories:
- Kafka
- Streaming
- AI
image: assets/blog-images/agentic-ai-streaming-use-cases/hero.svg
featured: false
hidden: false
teaser: Most of this year's agentic streaming launches repackage patterns Kafka users
  already run. A few things agents change really are new.
description: Most of this year's agentic streaming launches repackage patterns Kafka
  users already run. A few things agents change really are new.
toc: true
---

I've been living under my own rock beside the stream for a while, and Current '26 was a good porthole to what everyone else seems to be up to. For a few months I'd found myself wondering what Redpanda was up to these days, and wtf an agentic data plane is. I even attended a Confluent hackathon (an elaborate copy-pasta drill, as it turned out) and TIL'd about Lightning Tables.

What everyone seems to be up to is agents: the major streaming vendors all shipped agent infrastructure in 2026. Confluent added a fifth pillar to its platform, called Query, and put agents on top of it.[^streamhouse] Redpanda built an agentic data plane,[^redpanda] and Apache Flink grew an agents sub-project.[^flink-agents] Read against their own documentation, most of it is a pattern Kafka users have run for years under another name. A few things are new, and they're mostly missing from the launch slides.

The question for anyone running Kafka and Flink is which of these launches to buy, which to build, and which to ignore. Sorting them takes two piles: old wine in new bottles, and use-cases that genuinely didn't exist before agents.

* * *

The pivot has a cause. The log itself stopped being something a vendor could charge a premium for.

- **Diskless topics.** Apache Kafka accepted KIP-1150 on 2 March 2026, putting object-storage topics on the upstream road map.[^kip1150]
- **Forks and rewrites.** StreamNative shipped Ursa for Kafka in April 2026, a fork of Kafka 4.2 and later on lakehouse-native storage.[^ursa]  Aiven, AutoMQ, WarpStream and Bufstream sell their own takes on the same idea.
- **Queues in the box.** Share groups, Kafka's native queue, have been production-ready since 4.2.[^share]
- **Consolidation.** Confluent now describes itself as "an IBM company".[^streamhouse]

When the protocol is common property and storage is moving to object storage, the margin moves up the stack, to serving, processing and governance. My read is that agents are the story that sells those layers. Each product still has to be judged on what it does that the layer beneath it couldn't.

## Mostly old wine

**4 November 2026: Lightning Tables and the Real-Time Context Engine.** Confluent's Streamhouse adds Query as a fifth pillar beside Stream, Connect, Process and Govern. At its centre is Lightning Tables: switch it on for a topic and the topic becomes a read-only table, refreshed within about 100 ms, queryable from SQL, HTTP, the CLI, JDBC and MCP. Confluent's own tests put queries at 10 to 100 ms and above 1,000 per second, on AWS only for now.[^streamhouse][^lt]  The Real-Time Context Engine is the MCP face of the same tables: an agent lists the topics, reads their schemas and writes its own SQL.[^rtce]

The SQL is single-table. Key lookups, filters, `ORDER BY` and `LIMIT` work; joins, aggregates, `GROUP BY` and subqueries are rejected.[^lt-sql]  Anything worth asking still gets computed upstream in Flink and written to a topic first. ksqlDB's pull queries already fetched "the current state of a materialized view",[^ksqldb]  and Kafka Streams has served its state stores to applications for years. The docs are admirably plain about the limits. A managed, MCP-addressable materialized view is a convenience, and an agent reading a schema and writing SQL against it is what a catalog and a SQL client have always offered. The "context" here is business state (orders, stock, accounts); conversation memory for agents is a different problem, and the product doesn't claim to solve it.

**19 May 2026: Streaming Agents, generally available.** Confluent's event-driven agents run inside Flink and Kafka pipelines.[^q2]  Flink Agents, an Apache Flink sub-project, does the same in the open and keeps agent memory in Flink state.[^flink-agents]  Stripped of the name, this is model inference inside a stream operator, keyed state used as memory, and an event-driven service around it. Each piece is old; a language model as the operator raises a problem of its own, which comes back in the second pile.

**The rest of the year.** The pattern holds:

- **Forecasts and anomalies that trigger an agent** to restock or escalate:[^q3] complex event processing with an alert that runs a runbook.
- **Share groups for agent tasks:** a work queue. Useful, with two caveats: no per-partition ordering, and no dead-letter queue until KIP-1191 lands.[^share]
- **AI gateways and agent data planes:** an API gateway and an identity provider. Redpanda's version issues short-lived, agent-bound tokens and logs every agent interaction for replay, which points at a real problem picked up below.[^redpanda]
- **Agent action logs:** event sourcing.
- **Managed MCP servers and agent skills for coding assistants:** developer tooling, welcome and unrelated to streaming.
- **Diskless storage and the "streamhouse":** storage cost architecture, marketed alongside the agent features.

| The launch | What it was already called |
|---|---|
| Lightning Tables, context engines | Materialized-view serving (ksqlDB pull queries, Kafka Streams state stores) |
| Streaming Agents, Flink Agents | Inference in a stream operator, keyed state, an event-driven service |
| Forecast or anomaly triggers an agent | Complex event processing and a runbook |
| Share groups for agent tasks | A work queue |
| AI gateway, agentic data plane | An API gateway and an identity provider |
| Agent action log | Event sourcing |
| Diskless, streamhouse | Storage cost architecture |

## Five things that are new

The new pile is shorter, and most of it is about the consumer.

**Replay no longer reproduces.** Streaming's deepest promise is that a log replayed through deterministic operators gives the same result. Exactly-once covers Flink's state and Kafka's offsets, and a model call sits outside both. Replay a pipeline whose operator is an agent and it makes the calls again, gets different answers, and bills you a second time. The fix is to treat model output as data: write every request, response and model version to the log, and have replay read the recorded output instead of asking again. Once that exists, a second capability follows. Fork the log at a point in history and run a new agent version against everything that happened since, which is a backtest for agents. AgileLog, at SOSP this year, proposes a shared log with forking primitives for exactly this.[^agilelog]

**The consumer acts for someone.** A service account does a fixed job, and its permissions are decided when the service is designed. An agent acts on a user's delegated authority and chooses its actions at runtime, so the authorization decision moves to the moment of each action, and the audit has to record why it acted (the prompt, the context it retrieved, the tool it chose) as well as what it did. Redpanda's agent-bound tokens and replayable interaction logs are the most direct answer shipped so far.[^redpanda]

**Every message costs money.** Backpressure used to be about throughput. When the consumer is a model, it is also about the bill. With $$r$$ events a second, a fraction $$f$$ of them sent to a model, $$t$$ tokens a call and a blended price of $$p$$ per token, the daily cost is

$$C_{\text{day}} = r \cdot f \cdot t \cdot p \cdot 86{,}400$$

For a modest security or commerce topic at 50,000 events a second, sending 1% to a model at 2,000 tokens a call and an assumed \$3 per million tokens (illustrative figures throughout):

$$C_{\text{day}} = 50{,}000 \times 0.01 \times 2{,}000 \times \frac{\$3}{10^6} \times 86{,}400 \approx \$259{,}000$$

A topic that spikes tenfold multiplies the bill tenfold. Which events earn a model call (sampling, tiering, caching) becomes an operator's decision with a price on it, alongside partition counts and retention.

**Threat response at machine speed.** Kafka in front of the SIEM is an old idea: security data pipelines that route, cut and enrich logs before indexing built a business out of it, with Cribl alone reported past \$200 million in annual recurring revenue.[^cribl]  The adversary is what changed. In the espionage campaign Anthropic disrupted in late 2025, AI performed 80 to 90% of the work, at peak making thousands of requests, often several a second.[^anthropic]  Response measured in hours stops being good enough against that, and detection is moving into the pipeline: SOC Prime's DetectFlow runs Sigma rules with Flink on live Kafka streams, before the data reaches the SIEM.[^detectflow]  The layers are network flows, DNS, identity and endpoint signals, far more than observability telemetry, and the cost equation above rules out sending all of it to a model. The shape that works is tiered: cheap rules and models on every record, and an agent triaging the small residue that's left.

That makes Kafka and Flink necessary infrastructure where detection fans out to several detectors, correlates signals across layers, or needs to replay history against a new rule. The usual objection is that a broker is one more hop before detection. That stops holding when the broker runs next to the workload, which is a story for another day.

**Continual learning from agent traces.** Online learning on Kafka and Flink is established practice. ByteDance's Monolith logged user actions to Kafka, joined features in Flink and updated model parameters as the data arrived, back in 2022.[^monolith]  Continual learning for agents mostly changes prompts, retrieval, memory, tools and routing, and only sometimes weights, in a governed loop from production traces.[^arize]

![Agent traces flow into Kafka; Flink joins late labels and grader scores by trace ID and watches for drift; fast updates to memory, prompts and tools go straight back to the agent; traces and labels land in Iceberg as training and regression sets; evals gate promotion or rollback; weight retraining reads from Iceberg in batch.](../assets/blog-images/agentic-ai-streaming-use-cases/continual-learning.svg)

Kafka's part in that loop is specific:

- **Trace capture.** Every request, tool call, response and model version, which is the same record that makes replay reproducible.
- **Late-label joins.** Feedback, grader scores and outcomes arrive minutes or days later; Flink joins them to the trace by ID.
- **Drift detection.** Shifts in inputs, tool-call mix and failure clusters, while they're happening.
- **Fast updates.** Memory, retrieval and prompt changes that ship without retraining.

The training and regression sets belong in Iceberg, large trajectories belong in object storage with a pointer in the message, and for agents, weight retraining runs in batch, where Kafka's milliseconds buy nothing. The loop needs numbers to steer by:

- **Freshness:** event-to-trainable lag, and time from a fix to its promotion.
- **Labels:** label delay, coverage, and grader agreement with humans.
- **Quality:** regression-set pass rate, held-out regressions, calibration.
- **Drift:** input distribution, tool-call distribution, new failure clusters.
- **Safety:** rollback rate, and canary deltas against the current version.
- **Cost:** tokens per resolved task.

The recorded model outputs that make replay honest are the same records this loop learns from.

## Which launch to buy, and when

As of November 2026, the choice follows where the data is born and what the agent does with it:

- **The data is born as events and the decision changes within seconds** (fraud, stock, dispatch, security): stream-native serving earns its keep. Check whether single-table queries are enough before buying a serving layer that can't join.
- **The agent needs joins and aggregates over live data:** a streaming database (Materialize, RisingWave, Feldera) or Flink writing into a database you already run.
- **The context lives in systems of record** (the CRM record, the contract, the ticket): MCP on the source or a read replica, or change data capture into a store you operate. A stream adds a copy without adding freshness the agent can use.
- **The agent needs crash-safety, long waits and retries:** a durable execution engine (Temporal, Restate, DBOS) handles model calls as side effects more naturally than an agent inside a stream operator.
- **Agent tasks need dispatching:** share groups, if you're on Kafka 4.2 or later and can live without ordering and a dead-letter queue for now.
- **Agents need an action log:** a topic you already have, with model outputs recorded so the log replays.
- **Security:** Kafka and Flink where detection fans out, correlates or replays; filtering at the sensor everywhere else.
- **Continual learning:** Kafka carries traces and joins labels, and Iceberg keeps what the models learn from.

These piles would shift if the products changed. A serving layer that joins and searches, a log that records and replays model outputs as a primitive, or budget-aware backpressure in the broker would each move something from the second pile into a product worth buying. None has shipped yet. Until one does, most of the new bottles hold wine you already own.

[^kip1150]: [Diskless Kafka: what happens when brokers stop owning the data?](https://softwaremill.com/diskless-kafka-object-storage-kip-1150-and-kafkas-future/), SoftwareMill; [Data streaming trends Q3 2026](https://www.kai-waehner.de/blog/2026/09/21/data-streaming-trends-q3-2026-what-changes-through-2027/), Kai Waehner, 21 September 2026.
[^ursa]: [StreamNative introduces Lakestream architecture and launches native Kafka service](https://www.businesswire.com/news/home/20260407143701/en/StreamNative-Introduces-Lakestream-Architecture-and-Launches-Native-Kafka-Service-Unifying-Streaming-and-the-Lakehouse), Business Wire, 7 April 2026.
[^share]: [Kafka share groups](https://thoughtworks.com/radar/platforms/kafka-share-groups), Thoughtworks Technology Radar, 4 November 2026.
[^streamhouse]: [Confluent introduces its Streamhouse architecture](https://newsroom.ibm.com/2026-11-04-confluent-introduces-its-streamhouse-architecture-to-power-ai-with-real-time-business-context), IBM Newsroom, 4 November 2026. Performance figures are Confluent's internal testing.
[^lt]: [Lightning Tables in Confluent Cloud](https://docs.confluent.io/cloud/current/lightning-tables/overview.html), Confluent documentation, updated 16 November 2026.
[^rtce]: [Query a Lightning Table with MCP](https://docs.confluent.io/cloud/current/ai/real-time-context-engine/query-data.html), Confluent documentation.
[^lt-sql]: [Lightning Tables SQL reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html), Confluent documentation, updated 16 November 2026.
[^ksqldb]: [Queries](https://docs.ksqldb.io/en/latest/concepts/queries/), ksqlDB documentation.
[^q2]: [Confluent Cloud Q2 2026 launch](https://www.confluent.io/blog/2026-q2-confluent-cloud-launch/), Confluent, 19 May 2026.
[^flink-agents]: [Ververica debuts Flink Agents](https://siliconangle.com/2025/10/15/ververica-debuts-flink-agents-bring-autonomous-ai-real-time-data-streams/), SiliconANGLE, 15 October 2025.
[^q3]: [New in Confluent Intelligence and AI tools](https://www.confluent.io/blog/2026-q3-confluent-intelligence-ai-update/), Confluent, Q3 2026.
[^redpanda]: [Redpanda acquires Oxla, launches Agentic Data Plane](https://www.redpanda.com/press/redpanda-acquires-oxla-launches-new-agentic-data-plane-for-enterprise-data), Redpanda, 28 October 2025.
[^agilelog]: Bhat, Hong, Noguera, Ganesan and Alagappan, [AgileLog: a forkable shared log for agents on data streams](https://arxiv.org/abs/2604.14590), SOSP 2026.
[^cribl]: [Market guide 2025: the rise of security data pipelines](https://softwareanalyst.substack.com/p/market-guide-2025-the-rise-of-security), Software Analyst.
[^anthropic]: [Disrupting the first reported AI-orchestrated cyber espionage campaign](https://anthropic.com/news/disrupting-AI-espionage), Anthropic, 13 November 2025.
[^detectflow]: [SOC Prime's DetectFlow Enterprise moves threat detection to the data ingestion layer](https://www.helpnetsecurity.com/2026/03/12/soc-primes-detectflow-enterprise-moves-threat-detection-to-the-data-ingestion-layer/), Help Net Security, 12 March 2026.
[^monolith]: [Monolith: real time recommendation system with collisionless embedding table](https://arxiv.org/abs/2209.07663), ByteDance, 2022.
[^arize]: [Continual learning for AI agents and LLM systems](https://arize.com/resources/continual-learning/), Arize, reviewed 16 August 2026.

<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js"></script>

