---
layout: post
title: "Where Should Your Data Live? Local NVMe, Object Storage and the Memory Hierarchy"
author: p6
categories: [Data, Infrastructure, Distributed Systems, Kafka, Platform Engineering]
image: assets/blog-images/memory-hierarchy/memory-hierarchy.svg
teaser: "\"Local NVMe or S3?\" is the wrong question. Decide which tier holds the truth, which tiers cache it, and what a miss costs."
featured: false
hidden: false
toc: true
---

"Local NVMe or object storage?" is a false binary. Every storage system is a memory hierarchy. The real decisions: which tier is the source of truth, which tiers are caches, what a miss costs at each boundary.

<small>Ref: [thread on X](https://x.com/jorandirkgreef/status/2118057836207104173)</small>

## 1. The two designs converge

| | Local-disk design | Object-store design |
|---|---|---|
| Hot reads | RAM → local NVMe | RAM → local NVMe cache |
| Miss | Local NVMe, µs | Object store, ms |
| Durable commit | Replicate cross-zone, then ack | Write to object store, then ack |
| Source of truth | Replicated local disks | Object store |
| Weak spot | Fixed capacity, slow rebuilds | Tail latency, cold caches |

Same working set, same single round trip per durable write. They differ only in where truth lives, the cost of a miss, and the cost of capacity and recovery.

## 2. Every tier becomes a cache

DRAM → cache for disk. Disk → cache for tape. SSDs made the network the bottleneck of network storage. Now local NVMe → cache for object storage (diagram above).

Each tier down: ~10× slower; buys capacity, durability, elasticity or $/GB. Put each byte on the cheapest tier that meets its latency budget; make misses rare and cheap. Numbers: our [napkin math]({{ site.baseurl }}/real-time-data-prime-time/#napkin-math-numbers-2024).

## 3. Reads: working set decides

<div class="mermaid" style="display:flex; justify-content:center">
flowchart LR
    Q[Query] --> RAM{In RAM?}
    RAM -- hit --> A1[~100 ns]
    RAM -- miss --> NVME{On local NVMe?}
    NVME -- hit --> A2[~10s of µs]
    NVME -- miss --> SRC[Source of truth]
    SRC --> L[Replicated local disk<br/>or network block storage<br/>~sub-ms]
    SRC --> O[Object storage<br/>~ms to 10s of ms]
</div>

| Working set | Implication |
|---|---|
| Fits in RAM | Storage tier barely matters |
| Fits local NVMe, not RAM | Local flash decides; either design provides it |
| Wide, random (big keyspace, cold scans) | Misses dominate p99/p999; local NVMe's flat tail wins |

Metric: hit ratio per tier boundary, not instance type.

## 4. Writes: durability costs one round trip

<div class="mermaid" style="display:flex; justify-content:center">
sequenceDiagram
    participant C as Client
    participant P as Primary
    participant R as Replica (other AZ)
    participant S as Object store
    Note over C,R: Local-disk design
    C->>P: commit
    P->>R: replicate
    R-->>P: ack
    P-->>C: ack (one cross-AZ round trip)
    Note over C,S: Object-store design
    C->>P: commit
    P->>S: PUT (batched)
    S-->>P: ok
    P-->>C: ack (one object-store write)
</div>

Cross-zone replication vs object-store write. Deciders:

- **Store write latency:** standard object storage ~10s of ms; low-latency zonal classes single-digit ms, at the cost of multi-zone durability.
- **Batching:** amortises latency and request cost; adds per-write latency.
- **Cost:** cross-zone replication traffic is billed; one regional write isn't. Object-store-first wins for high-volume, log-shaped data.

## 5. Object storage: best bottom tier, not a system

Gives: managed multi-zone durability; small immutable interface (now with conditional writes) that pushes designs log-structured; elastic capacity; recovery becomes cache warm-up, not data copy; cheap per GB, costly per request.

Doesn't give, and you still own:

- RAM/NVMe cache sizing, eviction, cold restarts (usually mid-incident)
- Metadata: object set, ordering, writer fencing (typically consensus-backed)
- Compaction and GC (else read amplification and a big bill)
- Miss-path behaviour: rate limits, throttling, tails

Simpler capacity and durability; not a simpler system. On-call moves to the cache and metadata layers.

## 6. Streaming already did this

- **Tiered storage** ([KIP-405](https://cwiki.apache.org/confluence/display/KAFKA/KIP-405%3A+Kafka+Tiered+Storage)): hot segments local, cold in object storage.
- **Diskless** ([KIP-1150](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1150%3A+Diskless+Topics), object-store-native Kafka-compatibles): write path on object storage; higher produce latency for no cross-zone replication traffic and near-stateless brokers.

Choose per workload, not per cluster:

| Workload | Latency budget | Source of truth |
|---|---|---|
| Payments, orders, control plane | Low 10s of ms, tight p99 | Replicated local disks + tiered history |
| CDC into analytics | Seconds | Tiered or diskless, by volume |
| Logs, metrics, clickstream | Seconds–minutes | Object-store-first |
| Long-term replay | Throughput | Object storage behind a cache |

## 7. Checklist

1. Working-set size vs RAM and NVMe per node (measured)
2. Miss rate per tier boundary and latency behind it
3. p99/p999 budget
4. Round trips per durable write; batching tolerance
5. Recovery: rebuild from peers or warm from store? Duration, degradation
6. Cost: IOPS caps, provisioned throughput, cross-zone transfer, per-request charges
7. Owner of the cache, metadata and compaction

## Takeaway

Miss-heavy OLTP: local NVMe. High-volume logs: cached object storage. Durability costs a round trip either way. Pick the tier that holds the truth; cache the rest; keep misses rare and cheap.
