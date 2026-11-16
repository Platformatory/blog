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


As of 2024, Apache Kafka is almost a teenager. A project & community that has been nothing short of pivotal and truly deserving of the category creator hall of fame. However, the teenage years are a little crazy.


# The fundamentals are still strong, but Apache Kafka ~~is almost legacy~~ is a little behind

But let's state it right at the onset: Building still in the (mostly) on-premise era, The founders of Kafka were true visionaries who got a lot right, straight from the onset.  Building on JVM (memory safety, GC, for better or worse), persistence as a first class concern , a design focused on commodity HDDs (optimized for sequential I/O), zero copy optimizations, all on top of a relatively minimalistic API surface, and tons of bolt-ons organically evolved over the years. Till date, every KIP still conforms to a spirit of performance focus, a design ethos that is beyond question.

Justifiably, Kafka has emerged as the de-facto mechanism for data exchange. The Kafka API has also become a gold standard beyond its own, self-branded implementation. It is now supported by an increasing mushroom cloud of technologies, both OSS and commercial, tackling the same class of problems Kafka originally set out to. Although for the most part, the USP is about gaining an “install base” audience, touting “compatibility and drop-in replacement” -- a classic market focused adoption play, but at any rate, standardizing on someone else’s API is still the deepest form of flattery you can get in tech.

As of 2024, every hyperscaler provides a Kafka (or compatible) managed service and there are now, prospectively best in breed Kafka-esque platforms emerging beyond the Apache Fn project

Everything is a product of its times and Kafka is no different. While the community still keeps up (which we shall discuss later on), it only does so with much baggage and design constraints that it was born with, some of which are just structural in nature. 


# Some things are still less right and more wrong

Over the years, there has been a greater convergence of what were kafka’s deficits, but it also falls into the zone (in 20:20 hindsight) of trends that green-field, cloud native b(l)oomer projects have been beneficiaries of.

Let’s look at a few dimensions of differentiation:


1. A simple(r) distribution: aka, a single binary. No Zookeeper (or a better Zookeeper)
2. Squeezing the last drop of performance: aka, getting rid of the JVM (and it’s concurrency model)
3. A modern approach to storage: aka separating storage from compute (and more loosely, tiered storage) but also SSDs. And the radical new idea of completely doing away with disks.
4. Operator Experience: aka, something better than the clunky kafka run class tools
5. A longer exhaustive list: Multi-tenancy, 2PC, Adaptive Partitioning, Proxies (and more)

For example, Pulsar was the first to objectively address (1) and parts of (5). But it did introduce additional complexity with Apache Bookkeeper. JVM has been a perennial bottleneck and therefore a C++ based rewrite like Redpanda, armed with a Seastar core and a storage layer for modern SSDs, beats Kafka benchmarks on all of throughput, latency and node count relatively easily in most scenarios. WarpStream and AutoMQ take the storage debate to the holy grail of cloud native architectures - ie, to S3. Confluent on its own part has built several enterprise features, including tiered storage, but also what is probably the most robust DevX and OperatorX around Kafka. 

Obviously these are available in self hosted and BYOC variations. Not to speak of the cloud-first offerings, such as Confluent Cloud itself, but also the comparable (atleast Kafka for kafka terms) AWS MSK serverless, Azure Event Hubs and most recently, Google entering the Kafka market with Apache Kafka for BigQuery.

Infact, the distinction is so stark that the marketing pitch from nearly everyone involves some flavor of 10X differentiation from self-hosted Apache Kafka, including Confluent, Apache Kafka's corporate steward.

The truth is that the Apache Fn project (and together with Confluent which employes a number of committers) has addressed most of these challenges highlighted above as differentiation, but it has largely been as a follower. The basic fact is that open source now lags behind.

# Streaming is still a low latency niche

Streaming systems are fundamentally designed to optimize for incremental processing and lower latency. While there's no doubt about the value of real-time data, acting upon data in motion requires a much more comprehensive focus, on a still volatile and maturing stack and many inherent complexities (such as time domain, stateful processing, consistency) which most stakeholders used to batch processing simply don't fully grok.

When asked to tradeoff latency against the costs and complexity of achieving it, we have seen that most businesses tend to make it an easy decision. They can live with a few more seconds (sometimes hours) of latency.


# TCO is shaping the future of Kafka

We talked previously about the mushrooming of the _de-novo Kafkaesque_. While you would expect this market to be all about the hype of real-time and the art of the possible, ground reality is that sales and adoption conversations are largely led by TCO.

TCO is a very subjective and opaque metric that needs quantification of the customer's operating capability, personnel costs and most importantly tangible opportunity cost. In most cases, this is not an honest conversation between sellers and enterprise  buyers.

This leads to very contrived forms of differentiation and commercial discounting from vendors of a “must win” nature, relationship plays, package deals, FUD about competition, and often, plain bs.

At the end of the day, it is pretty simple. In private cloud, on-premise and BYOC environments it reduces to these factors:


* number of node or core licenses required to guarentee a certain (peak) throughput (lower is better, relative to present state, realistic projections and head-room for growth)  
* Cross-zone / cross-region networking models (and therefore ingress/egress charges)

With cloud (and specifically serverless), it boils down to:

* throughputs (in other words ingress/egress)
* concurrency,
* partition counts
* storage

In a world where everyone prefers serverless options on the cloud and a desire to pushdown durability to the vendor, while avoiding cross-AZ surprise billing (down to the cloud provider), the race to the bottom for data infra at the lowest cost will always be won by the holy grail of all data foundations, which is, (drumroll) AWS S3. Or more generally, cloud object storage. But we emphasize S3 because AWS is a first mover for all sorts of things on the cloud and S3 Express 1Z is defining a new frontier by providing consistently sub-10ms latencies directly at the bedrock of durable storage. This would have sounded provocative many years ago, but in 2023-24, in very much the footsteps of every other , a Kafka API on top of S3 directly was just something waiting to be built. 

This is exactly what WarpStream is doing and although there will be fast followers (sometimes pioneers who grudgingly claim independent discovery of the idea). First movement and execution matters. Acknowledging good competition is good.

The writing on the wall is pretty clear. Kafka on the cloud is way more expensive than it needs to be. A Kafka protocol on top of object storage will satisfy the pareto principle for most workloads in a TCO defense. Latency will only get better in times to come. Soon enough, such clusters will be a commodity. Curiously, in this implementation, there are no leaders, replicas or ISR.  It definitely foreshadows what the Kafka platform landscape is headed to: a leaderless future.


# Dumb pipes are a commodity. The value is up the chain

So far we have spoken about competitive dynamics. But the surface area of Kafka is actually pretty minimalistic. It mostly provides pub-sub plumbing for a distributed world. Shock absorbers between systems. Big buffers and flood controls. Fire Hoses. Fundamentally pipes though. Dumb pipes at that.

However, with good dumb pipes, you can still build a whole ecosystem of tooling. And that's really where the value lies. Connectors, Stream processing, streaming databases, real-time features, real-time databases, event-driven architecture, ML/AI even. 

The sum total of all these components and coverage of various cross cutting concerns forms the streaming platform. A platform which you can build multi modal data products on.


# Instant Data Lakehouse. Far from there

One of the architectural advantages of streams as a foundational data primitive, combined with the trends we have discussed, of tiered storage and no disks (object storage) is an interesting innovation in fully embracing Kappa architecture. Continuous streams that hydrate lakes, warehouses and everything in between, but without the need of additional plumbing. 

The side effects of offloading storage in full part to S3 is that your Kafka log segments can be magically turned into open tables which query engines, warehouses and lakehouses can directly talk to. Or perhaps even more appealing are the likes of DuckDB and a whole ecosystem of an up & coming, headless, composable data stack that layers on top of it.

This has profound implications on the cost and economics of data architectures. However, be cautioned: It is still early days and this is largely architecture astronomy with many feature gaps. Batch and streaming do have pretty stark context boundaries and limited shared vocabulary or even good tooling. Even Flink is certainly not there yet. Spark and Spark streaming is fundamentally still a microbatch primitive under the hood. Projects like Beam have a vision but are fundamentally limited by runners they integrate with. Over the course of time, one would expect some truly unified experience and consistent APIs. Perhaps with the advent of Arrow, Ibis Data and the like.


# Convergence and Divergence

Protocols and APIs always outlive platforms. Kakfa certainly enjoys the protocol privilege as it stands. However, in any market that leads to a commodity, it is exceedingly difficult for vendors to keep baselining themselves against an API of another project they don't control. 

While open standards such as AsyncAPI and CloudEvents are extant, their vision is pretty narrow and purpose specific to interoperability, rather than as a foundation to streaming.

The natural consequence is that while everything in the short term is still converging to Kafka, it is likely that in the long term, market forces will propel vendors to differentiate. 

> For the curious and nerdy, we will have a series to publish about the internals of NATS and Kinesis to begin with.

> If you are a Kafka user and interested in our technical whitepaper about the Kafka landscape, register your interest here and we will share a copy. It also contains a holistic analysis of the real-time data stack and SWOT plots for Confluent, Redpanda, WarpStreamMSK, Azure Event Hubs and GCP Kafka for BigQuery













