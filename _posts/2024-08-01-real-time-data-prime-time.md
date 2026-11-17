---
layout: post
author: p6
categories: [ Platform Engineering, Real-time, Stream Processing, Kafka ]
image: assets/blog-images/real-time-primetime/real-time-primetime.webp
featured: true
hidden: true
teaser: How to build intelligent applications and platforms to process data within seconds.
toc: true
weight: -11
title: Real-time Data on Prime-Time
---

Everything real-time is bound by physics: clocks, memory, storage and networks all take time. [Hard real-time systems](https://en.wikipedia.org/wiki/Real-time_operating_system) need interrupts and determinism; everything else lives with the [scheduler](https://en.wikipedia.org/wiki/Scheduling_(computing)).

Here, **real-time data** means milliseconds-to-seconds freshness in the inner loop of a process: IIoT failure detection, fraud prevention, hyper-local offers. Data grows ~25% a year (~120 ZB in 2024). Reacting in near real time needs a holistic architecture and fit-for-purpose components.

## Napkin Math Numbers (2024)

| Operation | Time |
|---|---|
| 1 GiB sequential memory read/write (10 GiB/s, 1 thread, no SIMD) | ~100 ms (SIMD: up to 4× faster) |
| 1 GiB sequential SSD read | 200 ms |
| 1 GiB SSD write, no fsync / with fsync | 1 s / 2 min |
| 1 GiB SSD random read | ~15 s |
| Same-AZ ping | 0.25 ms |
| Adjacent inter-region | 10–40 ms |
| Cross-region (cloud backbone) | up to 180 ms |
| Object storage op / S3 Express One Zone | 50 ms / 10 ms |

Theoretical; real workloads are slower, and at scale everything is distributed.

OLTP favours row layouts; OLAP favours columns. Separate teams own each estate (Conway's law), yet real-time needs the round trip between them bounded to sub-second-to-seconds.

## Typical Enterprise Data Flow

<div class="mermaid" style="display:flex; justify-content:center">
flowchart TB
    user[User] -->|Interacts with| requestService[Request-Response Service]
    requestService -->|Saves Data| db[(Oracle/Postgres)]
    db -->|Broadcasts Events| kafka[(Apache Kafka)]
    db -->|Triggered by| scheduledJob[Scheduled Job]
    kafka -->|Ingests Batches| s3[(AWS S3)]
    scheduledJob -->|Ingests Batches| s3
    s3 -->|Cleanses and Transforms Data| etlService[Cleansing & Transformation Service]
    etlService -->|Stores Transformed Data| snowflake[(Snowflake)]
    snowflake -->|Provides Data| dashboard[Power BI Dashboard]
    dashboard -->|Views Reports| ceo[CEO]
</div>

Batch architectures act on data at rest: reload, recompute, write back, paying storage latency every time. Incremental processing is better but hard: time domains, processing semantics, completeness and correctness, the [fallacies of distributed computing](https://en.wikipedia.org/wiki/Fallacies_of_distributed_computing), unbounded data on finite resources. Decisions are made on "what we know now".

> **Bottomline:** Real-time is hard. A city with traffic lights is easier to design than one without, and air traffic needs different principles altogether.

## Components for a Lower Latency, Real-time Stack

Numbers below are ballpark p99s for moderate throughput, highly available, consistency-sensitive workloads on ordinary cloud infrastructure. "End-to-end" sums every leg across the operational ↔ analytical divide.

### (1) Real-time Databases

| Class | Mechanism | Latency |
|---|---|---|
| SQL (Postgres, Oracle, MySQL) | ACID via WAL, fsync, quorum writes | High double-digit ms |
| High-performance NoSQL (Aerospike, ScyllaDB, Ignite, DynamoDB) | Indexes in DRAM, data on flash, optimised WAL | Low single-digit ms |
| In-memory (Redis, Memcached, HANA) | All in RAM; snapshots/AOF for durability | Sub-ms, weaker durability |
| Embedded (RocksDB) | Spills to disk | Near-memory, but you build the features |

<div class="mermaid" style="display:flex; justify-content:center">
sequenceDiagram
    participant Client
    participant DB as Database
    participant WAL as Write-Ahead Log
    participant Disk as Disk Storage
    participant Replica as Quorum Write
    Client->>DB: Write Request
    DB->>WAL: Write to WAL
    WAL->>DB: Acknowledgement
    DB->>Disk: Write to Disk
    Disk->>DB: Acknowledgement
    opt Strong Consistency
        DB->>Replica: Quorum Write
        Replica->>DB: Acknowledgement
    end
    DB->>Client: Write Acknowledgement
    Client->>DB: Read Request
    DB->>Disk: Read Data
    Disk->>DB: Data Response
    DB->>Client: Read Response
</div>

Data must eventually reach the analytical estate. Lowest-latency path: write-aside (outbox) inside the transaction boundary, or CDC.

<div class="mermaid" style="display:flex; justify-content:center">
graph LR
    A[Client] -->|Write Request| B[Database]
    B -->|Write to Outbox| C[Outbox Table]
    C -->|Commit Transaction| D[Database]
    D -->|Publish| E[Kafka]
    E --> F[Downstream Systems]
</div>

### (2) Streaming Pipes and Connectors

Write-aside is often blocked by org or architecture constraints, so data moves via connectors. A persistent buffer like Kafka beats point-to-point: bursty ingest, high fan-out, transactional fencing, retries, insulation from unavailable systems.

<div class="mermaid" style="display:flex; justify-content:center">
graph LR
    A[Client] -->|Write Request| B[Database]
    B -->|WAL| C[Write-Ahead Log]
    C -->|Change Detected| D[CDC Process]
    D -->|Publish| E[Kafka]
    E --> F[Downstream Systems]
</div>

Connector latency = source poll + transform + consumer lag + sink put.

<div class="mermaid" style="display:flex; justify-content:center">
graph LR
    A[Source] -->|Poll| B[SourceTask]
    B -->|Optional Transform| C[Kafka]
    C -->|Consume| D[SinkTask]
    D -->|Optional Transform| E[Sink]
</div>

- Kafka tail latency: single-digit ms.
- Connector pipelines: seconds to minutes end to end; parallelism helps. The lag is by design and absorbs bursts and outages.
- CDC reads a totally ordered WAL on one thread: lag on busy databases, slow snapshot backfills. Push beats pull for low latency.

### (3) Stream Processing

Read → operators (stateless or stateful, with state stores) → write, in parallel topologies. Stateful operators cost state-store I/O. Queryable state needs an API layer and key-to-store metadata.

<div class="mermaid" style="display:flex; justify-content:center">
sequenceDiagram
    participant Kafka as Kafka
    participant SourceProcessor as Source Processor
    participant Operators as Operators
    participant SinkProcessor as Sink Processor
    Kafka->>SourceProcessor: Read Data
    SourceProcessor->>Operators: Process Data
    Operators->>SinkProcessor: Write Data
    SinkProcessor->>Kafka: Commit
</div>

<div class="mermaid" style="display:flex; justify-content:center">
graph TD
    A[Kafka Source] --> B[KeyBy Function]
    subgraph Parallel Processing
        B --> C1[Map Function 1]
        B --> C2[Map Function 2]
        B --> C3[Map Function 3]
        C1 --> D1[Filter Function 1]
        C2 --> D2[Filter Function 2]
        C3 --> D3[Filter Function 3]
    end
    subgraph State Stores
        D1 --> E1[State Store 1]
        D2 --> E2[State Store 2]
        D3 --> E3[State Store 3]
    end
    E1 --> F[Sink Processor]
    E2 --> F
    E3 --> F
    F --> G[Kafka Sink]
</div>

- Adds ms to seconds, depending on topology, state, state backend and windows; watermarks and grace periods trade latency for completeness.
- Shuffles, checkpointing and effectively-once semantics cut throughput.
- Streaming databases aren't syntactic sugar: state and persistence are first-class, dataflow APIs are hidden, and the model is timely dataflow (epochs, progress tracking, cyclic flows) rather than DAGs. They can cover ~80% of use cases without Flink, Spark or KStreams complexity, at higher, storage-bound latency.

### (4) Real-time OLAP

Druid, Pinot, ClickHouse: stream ingest, columnar indexed storage over deep storage, scatter-gather queries at high concurrency.

<div class="mermaid" style="display:flex; justify-content:center">
graph TD
    A[Client] --> B[Query Nodes]
    B -->|Scatter| C1[Data Node 1]
    B -->|Scatter| C2[Data Node 2]
    B -->|Scatter| C3[Data Node N]
    C1 --> D[Deep Storage]
    C2 --> D[Deep Storage]
    C3 --> D[Deep Storage]
    D --> E[Indexing Service]
    E --> F[Ingestion Service]
    F --> G[Streaming Source]
    C1 -->|Gather| B
    C2 -->|Gather| B
    C3 -->|Gather| B
    B --> A
</div>

- The materialisation layer for sub-second queries over large streams (ad serving, high-concurrency analytics).
- Control ingestion: pull-based, low-level consumers beat consumer groups.
- Latency depends on indexes, upsert support, compaction, segment sizing, denormalisation over joins, and ingest-time roll-ups.

### (5) The Data Lakehouse

S3 is the core of every compute/storage-separated system: lakes, warehouses, Kafka itself, even OLTP. Lakes and warehouses converged via commoditised **open table formats** and **vectorised query engines**.

Streaming fit has been poor: object-store latency favours big files, and formats like Iceberg struggle with streaming. That's changing:

- Hudi merge-on-read tables handle streaming ingest and CDC; Paimon brings LSM optimisations and deep Flink integration.
- Object storage keeps getting faster.

<div class="mermaid" style="display:flex; justify-content:center">
graph TD
    A[Client] --> B[Query Engine]
    B -->|Query| C[Metadata Layer]
    B -->|Vectorized Execution| D[Open Table Format]
    D --> E[Object Storage]
    E --> D
    D -->|Data Retrieval| B
    C -->|Index Lookup| D
    C -->|Schema Evolution| D
</div>

- A unified storage and processing layer for moderate-latency streaming, e.g. CDC.
- Fills the gap between RTOLAP and classic lakes/warehouses: seconds to minutes end to end.
- Table formats differ; pick streaming-capable ones.
- Faster object storage (S3 Express One Zone) only improves the case.

### (6) Real-time ML (and datastore bolt-ons)

Time-series DBs (low-latency aggregation), feature stores (online + offline features), vector DBs (similarity search for RAG context at inference). The goal: unify the ML stack around inference latency on the freshest data, then continual learning with evaluation and drift control.

- Online feature stores serve in milliseconds (Redis/Aerospike/Cassandra-class backends), plus model serving and caching.
- Vector search is similar but varies with distance metric and dimensions; budget for it in RAG chains.
- Continual learning is still early: explainability and evaluation remain open.

### Conclusion

Low latency is hard. A firehose like Kafka is the lowest common denominator for moving data across the operational–analytical divide; pair it with best-in-breed components to process, materialise, query and manage the streaming estate.
