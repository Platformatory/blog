---
layout: post
title: 'Kafka at the Edge: Trading Consensus for Compatibility'
author: p6
categories:
- Kafka
- Edge
- IoT
image: assets/blog-images/kafka-at-the-edge/hero.svg
featured: true
weight: 9
hidden: false
teaser: Edge uplinks fail. A single-node Kafka-protocol log rides out the outage and
  keeps the ecosystem, by dropping the consensus a single node never needed.
description: 'Kafka at the edge for IoT: why a single-node Kafka-protocol log beats
  an MQTT broker plus bridge for plants, stores and vehicles with unreliable uplinks.'
toc: true
---

The defining property of an edge site is that its uplink fails. A plant on a leased line, a store on consumer broadband, a vehicle on cellular, a vessel on satellite: each loses its connection upstream for minutes, hours or days, and none can promise when it comes back. Everything else about edge streaming follows from that. Every edge architecture is also a decision about the compute continuum, about what runs on the device, on a gateway at the site, and in the cloud. The usual answer puts Kafka at the cloud end and something lighter, usually an MQTT broker and a bridge, everywhere else. We've built a different answer: Leafcuttr runs the Kafka protocol at the edge on a single node. It gives up the consensus and the parallelism that make Kafka a distributed system and keeps everything that makes it an ecosystem. This is the engineering case for that trade, and for when it's the wrong one.

* * *

Kafka's own project site says more than 80% of the Fortune 100 use it. Its industry snapshot counts all ten of the ten largest companies in manufacturing, and in energy and utilities, among its users, and eight of ten in transportation and in telecoms.[^kafka-home]  Those are the industries with the most sensors, plants, vehicles and networks. Nobody publishes a count of companies running Kafka for IoT specifically, so the honest version of the claim is narrower: in the industries that generate the most edge data, the platform that data is headed for already speaks Kafka.

The IoT stack agrees. ThingsBoard, an open-source IoT platform, lists Kafka as the queue for its incoming telemetry, and TBMQ, an MQTT broker, uses Kafka as the storage layer for its sessions and messages.[^powered-by]  Even systems built around MQTT land their data on Kafka, because that's where the consumers are: stream processors, connectors to warehouses and lakes, schema registries, security tooling, and the people who know how to run them. Every hop that speaks another protocol needs a bridge, and every bridge rebuilds a slice of that ecosystem.

## When the uplink is what fails

A site that can't reach upstream has to hold what it produces until it can. A log is the natural shape for that. Producers keep writing locally at their own pace, and forwarding upstream is one more consumer reading from an offset. When the link drops, the consumer stops. When the link returns, it resumes from its last committed offset, so catching up is a replay of the log rather than a recovery procedure, and nothing about the producers changes.

The arithmetic of an outage is simple. A site producing at rate $$r$$ through an outage of length $$t_{\text{out}}$$ needs local storage for $$r \times t_{\text{out}}$$, and with uplink bandwidth $$B$$ it catches up in

$$t_{\text{catch}} = \frac{r \, t_{\text{out}}}{B - r}$$

because new data keeps arriving while the backlog drains.

- **Backlog** at 1 MB/s through an eight-hour outage: 28.8 GB of local disk.
- **Catch-up** over a 5 MB/s uplink: 28.8 GB drained at 4 MB/s net, about two hours.
- **The limit:** as $$r$$ approaches $$B$$, catch-up time grows without bound, so a site that can't send less than it produces never catches up.

That last line is why the edge also needs to reduce data before it leaves, which we come back to below. Upstream, the destination is a cloud streaming service that speaks the same protocol, with the lake as an extension of it: many cloud streaming services now materialise topics as Iceberg tables, so the edge log, the cloud topic and the lakehouse table share one schema and one lineage. Leafcuttr forwards with an in-process MirrorMaker 2 instance, so the upstream side needs nothing Leafcuttr-specific.[^forwarding]

The obvious objection is that the producer could hold the backlog itself. Stock Kafka clients don't. The Java producer buffers in memory, 32 MB by default, and fails a record that isn't delivered within `delivery.timeout.ms`, two minutes by default. librdkafka's queue tops out at 100,000 messages or 1 GB and times a message out after five minutes.[^producer-buffers]  Agents that spill to disk do exist: the OpenTelemetry Collector can put its sending queue in a write-ahead log on disk, and Fluent Bit can buffer in the filesystem.[^spill]  For one application with no local readers, whose data only has to get upstream, a producer that spills to disk is simpler than a log beside it.

It stops being simpler with the second producer.

- **Every client changes.** A spilling Kafka producer is a fork of each client you run (Java, librdkafka and the many clients built on it, Go, Rust), each with its own disk format, fsync policy, retry logic and metrics.
- **The buffer is write-only.** Nothing at the site can read a spill file until it drains, and the edge has local readers: detection, control loops, and the filtering that shrinks the backlog before it crosses the uplink.
- **Some devices have no disk.** Sensors and controllers that speak MQTT can't spill, so something at the site holds their data anyway.
- **Replays duplicate.** The broker deduplicates retries by a producer ID it assigns and a per-message sequence number.[^design]  A producer that restarts and replays its spill gets a new ID, so unless it uses a transactional ID, the replay can land twice. A forwarder resumes from a committed offset.
- **The fsync stays.** A spill buffer that survives a power cut pays the same synchronous write as the log, in every application.

A sidecar log is that producer-side buffer moved out of the process and behind the protocol, so every client gets it without changing.

## What sits in the replication path

A Kafka cluster earns its complexity with two properties: availability through replication and consensus, and throughput through parallelism across many partitions and brokers. Both run through machinery that's always on the write path in a cluster.

- **Consensus.** A KRaft controller quorum holds the cluster's metadata, tracks broker liveness through heartbeats, elects partition leaders and records every change to a partition's in-sync replica set.[^design]
- **The ISR.** Each partition leader tracks which followers are in sync. A follower that hasn't caught up to the leader's log end within `replica.lag.time.max.ms` (30 seconds by default) is removed from the set.[^broker-config]
- **Follower fetch.** Followers pull from the leader continuously, and a message counts as committed only once every in-sync replica has it and the set is at least `min.insync.replicas` large.[^design]
- **Purgatory.** A produce request with `acks=all` can't be answered when the leader appends it, so it's parked in the request purgatory until the in-sync replicas have fetched it or it times out.[^purgatory]

None of that involves `fsync`. Kafka writes to the filesystem "without necessarily flushing to disk", leaving data in the page cache, and its designers rejected an fsync on every write because it "can reduce performance by two to three orders of magnitude".[^design]  The broker's `log.flush.interval.messages` defaults to 2<sup>63</sup>−1, so in practice the kernel decides when data reaches the disk.[^broker-config]  Kafka's durability comes from copies on other machines.

On one node there are no other machines, so that whole path is overhead with no protection behind it. A single-broker Kafka with a replication factor of one still acknowledges from the page cache, and a power cut loses whatever the kernel hadn't written. Leafcuttr's isolated mode takes the broker off that path: it runs "an optimised code path with replication disabled", with no ISR to maintain, no followers to wait for and no produce requests waiting in purgatory.[^isolated]  Topic sync then puts the guarantee back where a single node can keep it. Log segments are opened with `O_DSYNC`, so data is "committed to the physical medium before the producer is acknowledged".[^topic-sync]  The acknowledgement waits on the local disk instead of the network, which is the one dependency an edge site can count on.

That disk is often the weakest part of edge hardware. A synchronous write to an SD card or eMMC takes far longer than one to a datacentre SSD, and every one wears the flash. Topic sync is set per topic, `lc.log.sync.always`, so it belongs on the topics whose loss matters: commands, alarms and events of record. High-rate telemetry that can lose a few seconds in a power cut stays on the page cache and batches.  Synced topics need storage rated for their write load, which on most sites means industrial-grade flash rather than whatever the gateway shipped with.

We measured what dropping the replication path buys on a deliberately small allocation: half a vCPU and 1 GiB of memory on a 2-vCPU host. Apache Kafka 4.0.0 and a separate schema registry shared that budget, 400 and 100 millicores and 512 MiB each, while Leafcuttr runs the broker and the registry in one process and had all of it, so part of the difference is one JVM instead of two, which is the point of combining them. One producer wrote 10 KB records to 12 partitions, evolving its schema as it went, three runs per case:[^lc-bench]

- **fsync on, stock producer:** 3.55 MB/s for Leafcuttr against 1.96 for Kafka, with average latency of 5.5 seconds against 8.9.
- **fsync on, tuned producer** (200 KB batches, 100 ms linger, LZ4): 32.53 MB/s against 23.21, with a p99 of 1.77 seconds against 2.47.
- **tmpfs, stock producer:** 87.64 MB/s against 72.1, with a p99 of 411 ms against 753.

![Two write paths. In a replicated cluster, a produce request with acks=all is appended by the leader, held in purgatory while followers fetch it, and acknowledged once the high watermark passes it, with the controller quorum managing leadership and the in-sync set; nothing is flushed to disk. On a single Leafcuttr node in isolated mode with topic sync, the write goes to the log with O_DSYNC and is acknowledged once it's on disk.](../assets/blog-images/kafka-at-the-edge/replication-path.svg)

A producer could get some availability back without consensus by sending each write to two or more edge brokers and treating the first acknowledgement as success. That's leaderless replication with a write quorum of one, and it keeps writes flowing while one broker is down. It gives up durability, because at the acknowledgement one copy exists and a broker that fails before the others receive the record takes it with it. It also gives up the single log. Each broker assigns its own offsets, writes from several producers interleave differently on each, and partial failures leave the brokers holding different records.

The cost lands on every consumer.

- **Failing over** to another copy needs offset translation or a seek by timestamp, with duplicates or a gap at the switch, because committed offsets mean nothing on the other broker.
- **Reading every copy** needs a producer ID and sequence on each record and dedup state in each consumer, kept for as long as the worst outage. Per-producer order can be rebuilt from the sequences; order across producers isn't defined anywhere.
- **Upstream** receives each record once per copy, so the cloud deduplicates too.

That's workable for telemetry keyed by device and timestamp, where per-device order is all that matters and every write is an upsert. Journals are another matter, since there the order is the record. Stock Flink, Connect and Kafka Streams jobs don't deduplicate across independent logs either, so a swapped-out producer brings swapped-out consumers with it. A site that has to survive a broker failure is better served by two or three brokers replicating over the site's LAN, where the network is reliable and consensus is cheap. Consensus belongs inside the site, and the uplink is where it stops paying.

* * *

Speaking the Kafka protocol at the edge is worth the trade only if the rest of the ecosystem comes with it, starting with the contracts and the processing.

- **Schemas.** Leafcuttr embeds a schema registry compatible with the Confluent Schema Registry API, stored in a Kafka topic, so producers at the site register and validate schemas offline with the same serializers they'd use against the cloud.[^schema-registry]
- **Processing.** Leafcuttr v1.0 adds filters, joins and functional operators over local topics, so a site can drop noise, enrich readings with local reference data and aggregate before anything crosses the uplink.[^features]  On a flaky or metered link, every byte filtered locally is a byte that never sits in the backlog.
- **Other protocols.** MQTT 3 and 5 and HTTP are accepted in the same process, with MQTT topics mapped to Kafka topics, so devices that can't speak Kafka still land in a Kafka log without a separate broker or bridge.[^mqtt-proxy]

* * *

The alternative to a log at the edge is the familiar stack: an MQTT broker at the site, a bridge that consumes from it and produces to Kafka, and Kafka somewhere upstream. MQTT is good at what it does, and devices that can only speak it should keep speaking it. The extra layers still cost something.

- **Compute.** In an independent benchmark of eight brokers on edge-sized machines, Mosquitto used 284 to 620 MB under load, HiveMQ 487 MB to 1.7 GB and EMQX 650 MB to 3.7 GB.[^iot-bench]  A Kafka Connect worker's start-up script gives it a heap of up to 2 GB by default.[^connect-heap]  A broker plus a bridge carries roughly 2.3 to 2.6 GB of defaults and two runtimes before the site stores a byte in a log.
- **Durability.** An MQTT QoS 1 acknowledgement means the broker has the message, which may still be only in memory. Mosquitto's persistence is off by default, and when it's on it saves every 1,800 seconds by default.[^mosquitto]  A crash between saves loses up to $$r \times t_{\text{save}}$$, 1.8 GB at 1 MB/s.  A bridge holding data while upstream is unreachable adds its own buffer, and in memory-only mode the vendor's documentation leaves loss to the caller.[^emqx]
- **Latency.** The broker hop is fast, with median latency of 0.21 to 0.76 ms for 1 KB messages, but under injected network faults the same benchmark's p99 rose to about 3 seconds for every broker tested.[^iot-bench]  The bridge then batches like any producer, and since Kafka 4.0 a producer waits up to 5 ms by default to fill a batch.[^linger]

Tuning narrows the gap. Mosquitto with persistence on and a short autosave interval shrinks the window of loss,[^mosquitto] and a broker with its own Kafka integration, such as EMQX's Kafka bridge, replaces the Connect worker and most of its memory.[^emqx]   What tuning doesn't remove is the second protocol hop, a second store to size and watch, and the gap at the site itself: no Kafka clients, no schema registry and no local consumer reading the backlog in the protocol the cloud speaks.

The durability line matters most for the main problem. During an outage, the bridged path holds the backlog in the two places least suited to it: a broker that may not persist and a bridge buffer that may not either.

![Two paths from a device to cloud streaming. The bridged path runs through an MQTT broker, a bridge and Kafka: three processes, two translations, an in-memory acknowledgement by default, and batching delay at the bridge. The edge-log path writes once to a Kafka-protocol log on the same host or gateway: one process, no translation, an acknowledgement after a synchronous disk write, and asynchronous forwarding upstream when the link is up.](../assets/blog-images/kafka-at-the-edge/two-paths.svg)

## Sidecars and journals

A site gateway fans in many devices. The other shape on the continuum is one log per workload, running beside it as a sidecar on the same host or in the same pod. Leafcuttr runs either way.[^modes]

- **Streaming sidecar.** An application that already produces to Kafka keeps its client and its code. A network filter redirects its Kafka traffic to the local sidecar, or injected configuration points `bootstrap.servers` at localhost, so the application writes to a log on its own host and the sidecar forwards upstream when the link allows.  The producer sees a local broker that's always there, and an outage turns into backlog instead of produce errors and retry storms in application code.
- **Journal sidecar.** An autonomous system, such as a robot, a vehicle controller or an agent, records what it saw, decided and did in a local log beside it. The journal is the audit trail while the system is offline and replays upstream when it reconnects, in order, with the same schemas the cloud consumers expect.[^modes]

Because the routing happens in the network or in injected configuration, a platform team can roll sidecars out across a fleet the same way it rolls out a service mesh, without asking every application team to change a line.

* * *

Giving up consensus is the right call when the edge node's job is to capture, hold, shape and forward, and the system of record is upstream:

- **Telemetry and store-and-forward** from plants, stores, vehicles and robots, where outages are routine and a delay is acceptable but a gap isn't.
- **Bounded-time detection** on network flows or sensor data, where a local consumer has to act before the cloud could.
- **Agent and machine journals** that must survive the time they spend offline.
- **Feature and training capture** for models trained centrally on edge data.

It's the wrong call when the edge node is itself the system of record and must stay available through its own failure (replication and consensus exist for that, and the cloud should own it), when one site's throughput needs many brokers, or when the device is too small to run a broker at all. Those devices keep speaking MQTT, to a log that accepts it.

We build Leafcuttr, our Kafka-compatible edge broker, which also speaks MQTT and HTTP and forwards upstream to cloud streaming when the link is up.

[^kafka-home]: [Apache Kafka](https://kafka.apache.org/), project home page, read November 2026.
[^powered-by]: [Apache Kafka: Powered By](https://kafka.apache.org/powered-by).
[^forwarding]: [Leafcuttr documentation](https://docs.leafcuttr.io/print.html), Topic forwarding, v0.5.3: `lc.topic.forward.config` points at a MirrorMaker 2 configuration; the feature is marked work in progress.
[^design]: [Apache Kafka 4.1 documentation: Design](https://kafka.apache.org/41/design/design/), sections on persistence and replication.
[^broker-config]: [Apache Kafka 4.1 documentation: Broker configs](https://kafka.apache.org/41/configuration/broker-configs/): `replica.lag.time.max.ms` default 30000; `log.flush.interval.messages` and `log.flush.scheduler.interval.ms` default 9223372036854775807.
[^producer-buffers]: [Apache Kafka 4.1 producer configs](https://kafka.apache.org/41/configuration/producer-configs/): `buffer.memory` 33554432, `delivery.timeout.ms` 120000; [librdkafka CONFIGURATION.md](https://github.com/confluentinc/librdkafka/blob/master/CONFIGURATION.md): `queue.buffering.max.messages` 100000, `queue.buffering.max.kbytes` 1048576, `message.timeout.ms` 300000.
[^spill]: [OpenTelemetry Collector: resiliency](https://opentelemetry.io/docs/collector/resiliency/), persistent sending queue with the `file_storage` extension; [Fluent Bit: buffering and storage](https://docs.fluentbit.io/manual/administration/buffering-and-storage).
[^purgatory]: Yasuhiro Matsuda, [Apache Kafka, Purgatory, and Hierarchical Timing Wheels](https://www.confluent.io/blog/apache-kafka-purgatory-hierarchical-timing-wheels/), October 2015.
[^isolated]: [Leafcuttr: Isolated mode](https://docs.leafcuttr.io/features/isolatedMode.html), documentation v0.5.3.
[^topic-sync]: [Leafcuttr: Topic sync mode](https://docs.leafcuttr.io/features/topicSync.html); index and offset files still flush on the usual schedule.
[^schema-registry]: [Leafcuttr: Schema registry](https://docs.leafcuttr.io/features/schemaRegistry.html): `lc.schema.registry.enable`, default port 8081, schemas stored in the `_schemas` topic; Avro is the primary format.
[^features]: [Leafcuttr features](https://leafcuttr.io/features/): filtering, forwarding and aggregation listed as coming in v1.0.
[^mqtt-proxy]: [Leafcuttr: MQTT broker and proxy](https://docs.leafcuttr.io/features/mqttBrokerProxy.html); MQTT 3 and 5.
[^iot-bench]: Paul et al., [Benchmarking message brokers for IoT edge computing](https://arxiv.org/html/2603.21600v1), March 2026: eight brokers (Kafka not among them) on 1, 2 and 4 vCPU virtual machines; memory under load, median latency for 1 KB messages on 4 vCPUs, and p99 under injected TCP faults.
[^connect-heap]: [`bin/connect-distributed.sh`](https://github.com/apache/kafka/blob/trunk/bin/connect-distributed.sh): `-Xms256M -Xmx2G` when no heap is set; [`bin/kafka-server-start.sh`](https://github.com/apache/kafka/blob/trunk/bin/kafka-server-start.sh) gives a broker `-Xmx1G -Xms1G`.
[^mosquitto]: [mosquitto.conf(5)](https://mosquitto.org/man/mosquitto-conf-5.html): `persistence` defaults to false; `autosave_interval` defaults to 1,800 seconds.
[^emqx]: [EMQX Enterprise 4.x Kafka bridge](https://docs.emqx.com/en/enterprise/v4.2/bridge/bridge-kafka.html), on replayq's memory-only mode; current versions may differ.
[^linger]: [KIP-1030](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1030%3A+Change+constraints+and+default+values+for+various+configurations): `linger.ms` default raised from 0 to 5 in 4.0.
[^modes]: [Leafcuttr deployment modes](https://leafcuttr.io/modes/): gateway, sidecar or embedded, and agent journal.
[^lc-bench]: Our own benchmark, summarised at [Leafcuttr benchmarks](https://leafcuttr.io/benchmarks/): `apache/kafka:4.0.0` at 400m CPU, 512 MiB and a 460 MB heap plus a schema registry at 100m and 512 MiB, against Leafcuttr lc-0.4 at 500m, 1 GiB and a 920 MB heap, on a 2-vCPU, 8 GB host; 10,000-byte records, 12 partitions, one producer; averages of three runs.

<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js"></script>

