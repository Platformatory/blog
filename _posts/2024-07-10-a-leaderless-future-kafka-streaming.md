---
layout: post
title:  "A leaderless future: kafka-esque story on what is becoming mainstream"
author: p6
categories: [ Platform Engineering, Data, Infrastructure, Kafka, Real-time ]
image: assets/blog-images/kafka-leaderless-future/kafka-dystopian.webp
featured: false
hidden: false
teaser: kafka-esque story on what is becoming mainstream
toc: true
---

Kafka is nearly a teenager: category-defining, and now going through awkward years.

# Strong fundamentals, but ~~legacy~~ a little behind

Built for the on-prem era, Kafka got a lot right: the JVM, persistence as a first-class concern, sequential I/O on commodity HDDs, zero-copy, a minimal API, and a performance-first ethos every KIP still follows.

Its API is now the standard for data exchange. Every hyperscaler offers Kafka or a compatible service, and a crowd of "drop-in replacements" copy the protocol, the deepest form of flattery. But Kafka carries structural baggage from its birth.

# Where newcomers differentiate

1. **Simpler distribution:** single binary, no ZooKeeper
2. **Performance:** no JVM and its concurrency model
3. **Storage:** compute/storage separation, tiered storage, SSDs, or no disks at all
4. **Operator experience:** beyond the clunky CLI tools
5. **More:** multi-tenancy, 2PC, adaptive partitioning, proxies

| Contender | Angle |
|---|---|
| Pulsar | Solved 1 and parts of 5; added BookKeeper complexity |
| Redpanda | C++/Seastar, SSD-native storage; beats Kafka on throughput, latency and node count |
| WarpStream, AutoMQ | Storage on S3 |
| Confluent | Tiered storage, enterprise features, strongest DevX/OpsX |
| Cloud services | Confluent Cloud, MSK Serverless, Event Hubs, Kafka for BigQuery |

Everyone pitches a 10× gain over self-hosted Apache Kafka, its corporate steward included. Upstream has closed most gaps, but as a follower. Open source now lags.

# Streaming is still a low-latency niche

Streaming optimises for incremental processing and latency, on a maturing stack with hard problems (time domains, state, consistency) that batch-minded stakeholders don't fully grasp. Given the cost and complexity, most businesses accept seconds, even hours, of latency.

# TCO is shaping Kafka's future

Sales conversations are led by TCO: subjective, opaque, and rarely an honest buyer–seller exchange. Hence contrived differentiation, deep discounts, FUD.

It reduces to:

| Environment | Cost drivers |
|---|---|
| On-prem, private cloud, BYOC | Node/core licences for peak throughput (plus headroom); cross-zone/region networking |
| Cloud, serverless | Throughput (ingress/egress), concurrency, partition count, storage |

Buyers want serverless, vendor-owned durability and no cross-AZ billing surprises. The cheapest foundation for that is object storage, S3 first. S3 Express One Zone brings sub-10 ms latency to durable storage. A Kafka API directly on S3 was waiting to be built; WarpStream did it first.

Kafka on cloud costs more than it should. Kafka-protocol-on-object-storage covers the Pareto majority of workloads; latency will improve, and such clusters will commoditise. No leaders, replicas or ISR: **a leaderless future.**

# Dumb pipes are a commodity; value is up the chain

Kafka's surface is small: pub-sub plumbing, buffers, shock absorbers, firehoses. Dumb pipes. The value is built on them: connectors, stream processing, streaming and real-time databases, event-driven architecture, ML/AI. Together they form the streaming platform for multi-modal data products.

# Instant lakehouse: not there yet

Streams as the foundational primitive, plus tiered or diskless storage, enable full Kappa: continuous streams hydrating lakes and warehouses without extra plumbing. Log segments on S3 can become open tables that query engines, lakehouses and DuckDB-style composable stacks read directly.

Big economic implications, but still largely architecture astronomy:
- Batch and streaming share little vocabulary or tooling
- Flink isn't there; Spark streaming is micro-batch underneath
- Beam is limited by its runners
- Unified APIs may come via Arrow, Ibis and similar

# Convergence, then divergence

Protocols outlive platforms, and Kafka holds the protocol privilege. But in a commoditising market, vendors can't keep baselining against an API they don't control. AsyncAPI and CloudEvents target interoperability, not a streaming foundation. Short term, everything converges on Kafka; long term, market forces push vendors to diverge.

> Coming next: internals of NATS and Kinesis.

> Kafka users: ask us for our whitepaper on the Kafka landscape, covering the real-time data stack and SWOTs for Confluent, Redpanda, WarpStream, MSK, Event Hubs and Kafka for BigQuery.
