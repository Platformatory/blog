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


The speed of light in vacuum, according to [general relativity](https://en.wikipedia.org/wiki/General_relativity), is 3 * 10^8 m/s. All things fundamentally real-time are bound by the existing laws of physics (unless you consider hypothetical superluminal particles).

This includes computing as well. CPU clock speeds, flipping bits in memory, writing to and reading from storage, and transferring bytes over a network all take time.

So what does it mean to build “real-time” architectures within this reality? On one hand, you have [hard real-time operating systems](https://en.wikipedia.org/wiki/Real-time_operating_system) that must provide "hard" real-time guarantees, preemption and deterministic behavior in extremely low latency bounds. These rely on hardware interrupts. For everything else, we rely on the [kernel scheduler](https://en.wikipedia.org/wiki/Scheduling_(computing)).

For our purposes: real-time data basically refers to architectures that rely on data freshness, of the order of milliseconds to a few seconds of latency, at the inner loop of some process. While this metaphor is prevalent in many industries, such as for example Industrial IoT, where it is crucial to detect imminent system failures that can cascade in the order of a few seconds, it is also present prominently in various touch points of customer experience in the "human plane", such as a being able to prevent fraud or provide a real-time, hyper local offer. 

As the rate of data generated explodes YoY at a rate of 25% (from a whooping 120 ZB in 2024), being able to contextualize and react to data/events in (near) real-time becomes a crucial capability. To achieve this requires a holistic architecture vision and a number of fit-to-purpose platform components.

## Napkin Math Numbers (2024)

Before we dive deep into the minutiae of how to build real-time data architectures, let's  do some napkin math:

- To read/write a 1GiB to sequential memory, at a throughput of 10 GiB/s, using a single thread and no SIMD takes approximately 100ms.
  - With SIMD, you could do it up to 4 times faster.
- To read 1GiB sequentially from an SSD, you will need 200ms.
  - To write the same data (without fsync) it will take 1s.
  - To write the same data with fsync, it will take 2 minutes.
  - A random read would take 15 seconds on average.
- Network within the same AZ would have a ping latency of 0.25 ms.
  - Adjacent inter-region would be in the order of 10 - 40ms.
  - Between different regions of the cloud provider (“backbone”), this could increase up to 180ms.
- An object storage operation would be 50ms.
  - S3-Express-1Z would be 10ms.

These are theoretical numbers on standard hardware. Real-life workloads are usually slower than their published benchmarks due to unique characteristics. Data workloads vary significantly based on the use-cases they target. Almost nothing of scale fits into a single machine anymore, so a distributed workload with a networking element adds more complexity.

Operational data comprises classically [OLTP](https://en.wikipedia.org/wiki/Online_transaction_processing) datastores, where the access pattern largely results in row-based storage formats working better. Analytical data comprises, on the other hand, [OLAP](https://en.wikipedia.org/wiki/Online_analytical_processing) databases which layout the data along columns. This distinction is important for technical reasons and has implications for how enterprises manage these data estates. This dichotomy also has implications of Conway's law in that the teams (and org structures) that manage these data estates are different, sometimes with opposing forces and domains of control. However, to provide the real-time experience the latence ping-pong between these data estates must still be bounded within the subsecond to few seconds range.

## Typical Enterprise Data Flow

In order to unpack what makes this complex, let's consider a classic enterprise data saga: 

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

This outlines a “conventional” batch-oriented data architecture, which fundamentally acts upon data stored at rest. However, they generally follow "reload and recompute" everything semantics and therefore large latency penalties to access the storage layer, then load everything into memory, process the results and write it back. 

This begs the question: Why isn't incremental processing on data as it arrives the right thing to do? The answer is, yes (but is it worth it?). It comes with a lot of nuances that arise out of different notions of time domain processing, consistency models ("processing semantics") and expectations on completeness & correctness. Combined with all [fallacies of distributed computing](https://en.wikipedia.org/wiki/Fallacies_of_distributed_computing), and the fact that we are acting upon unbounded data and finite computing resources. We have to process decisions based on a snapshot of “what we know now,” knowing that we may not have the full information.

Since we're throwing physics metaphors in the post: Batch vs Streaming is a little like classical mechanics and quantum mechanics.

> **Bottomline:** Optimizing for latency is hard. Real-time is hard. Think about a traffic flow analogy. It is easier to design a city with traffic lights than without. However, you need different principles to manage air traffic.

## Components for a Lower Latency, Real-time Stack

Based on everything we know in 2024, let's explore the emerging real-time platform stack and analyze them from a standpoint of characteristic latency profiles.

When we talk through latency numbers here, we almost always refer to “ballpark” numbers on real-life workloads profiles. We will also specially qualify “end-to-end” latency, which is a summation measure across multiple legs of a single logical pipeline of data, across the operational <-> analytics divide. We also assume non-specialized workloads: i.e., moderate throughputs, high availability, strong needs for consistency and correctness, and ordinary infrastructure you can afford on the cloud. Tail latency is the most important consideration, so you can generally assume we are referring to p99 out here both for reads and writes. Based on this, we can identify at least 7 crucial classes of components you would typically require to build a fit-to-purpose architecture for real-time use-cases

### (1) Real-time Databases

Conventional databases like PostgreSQL, Oracle, and MySQL adhere to the ACID (Atomicity, Consistency, Isolation, Durability) principles to ensure reliable transaction processing. These databases guarantee that all operations within a transaction are completed successfully or none are, maintaining data integrity even in the case of failures. They achieve this through mechanisms such as Write-Ahead Logging (WAL), where changes are first written to a log before being applied to the database. This ensures that data can be recovered in the event of a crash. Additionally, fsync operations ensure that data is flushed from volatile memory to persistent storage, preventing data loss. However, these processes introduce latency due to the multiple write operations and the need to achieve consensus among replicas (quorum writes). As a result, while they provide strong guarantees of data consistency and reliability, they are relatively slower compared to newer database technologies.

Databases like Aerospike, which are optimized for high performance, also provide immediate consistency. Aerospike uses a hybrid memory architecture where indexes are stored in DRAM while data is written directly to flash storage. It uses a form of Write-Ahead Logging to ensure durability, but optimizes the process to minimize latency. Aerospike's design allows it to achieve low read and write latencies while maintaining strong consistency guarantees. The use of in-memory processing for indexes and optimized data paths for flash storage enables high throughput and efficient handling of large volumes of data.

In-memory databases like Redis, Memcached, and SAP HANA store data entirely in RAM, providing extremely fast read and write operations. By eliminating the need for disk I/O, these databases can achieve sub-millisecond latencies. Redis, for instance, maintains data structures like strings, hashes, lists, sets, and sorted sets in memory, allowing for quick data access. In-memory databases are particularly useful for applications that require real-time analytics, caching, or session management. However, the reliance on RAM makes them more expensive and less durable than disk-based databases. To mitigate this, many in-memory databases offer persistence options such as snapshotting and append-only files, which periodically write data to disk to prevent data loss in case of a system failure.

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


Real-time databases are beautiful. They are amazing feats of computing that enable truly real-time classes of experiences that power thing like matching users to ads, players in real-time gaming and even stock market bids. However, with real-time (and the the regular databases), it is inevitable that data must at some point be copied over to the analytical estate. The lowest latency way to do it is through a database write-aside approach.

<div class="mermaid" style="display:flex; justify-content:center">
graph LR
    A[Client] -->|Write Request| B[Database]
    B -->|Write to Outbox| C[Outbox Table]
    C -->|Commit Transaction| D[Database]
    D -->|Publish| E[Kafka]
    E --> F[Downstream Systems]
</div>

TL/DR

> * Most SQL databases will come at high double digit latencies
> * The most performant modern NoSQL stores can deliver low single digit millis latencies. Best representatives of real-time OLTPs would be: Aerospike DB, ScyllaDB, Apache Ignite, DynamoDB
> * In-memory databases provide sub millisecond latencies consistently (but poor durability). Embeddable in-process databases like RocksDB spill to disk (therefore durable at only marginal latency cost) but require users to implemement many features themselves
> * You must think about how to transmit changes to real-time. Ideally, a dual-write to a system like Kafka, within the database transaction boundary OR through approaches like CDC

### (2) Streaming Pipes and Connectors

We mentioned inevitably gets copied and moved around a lot. While the write-aside approach works, often it is infeasible due to organizational constraints and architecture deficit. This almost always necessitates the need for a connector layer to move data around from one system to another. While this can be done through point to point copies, it is unreasonably effective to plug in a large persistent buffer like Kafka that optimizes for low latency, high throughput ingestion (even for very bursty workloads) and high fan-out. This also means that connector architectures that rely on top of Kafka have a lot of advantages, such as being able to fence data movement into transactions, retry and generally insulate against unavailability of systems that are in the pipeline.


**Write-Through (CDC using WAL) Approach:**

<div class="mermaid" style="display:flex; justify-content:center">
graph LR
    A[Client] -->|Write Request| B[Database]
    B -->|WAL| C[Write-Ahead Log]
    C -->|Change Detected| D[CDC Process]
    D -->|Publish| E[Kafka]
    E --> F[Downstream Systems]
</div>


Connectors are responsible for moving data between different systems or components within a distributed architecture. They play a crucial role in ensuring that data flows seamlessly from sources to sinks. The performance of connectors is influenced by several factors including source-side latency, sink-side processing latency, transformation latency, and sink put latency.

Source-side latency is dependent on the poll frequency and network conditions. It measures the time it takes to capture data from the source system. For example, a connector might poll a database or a message queue at regular intervals to fetch new data. Network conditions can affect this latency, especially if the source and the connector are located in different regions.

Sink-side processing latency, also known as consumer lag, measures the time it takes for the data to be processed by the sink system after it has been captured by the connector. This can vary based on the load on the sink system and its capacity to process incoming data.

Transformation latency refers to the time taken to transform or process data as it moves through the connector. This can occur on both the source side and the sink side. Transformations might include data enrichment, filtering, or format conversion. While transformations add flexibility and value to the data pipeline, they also introduce additional latency.

Sink put latency measures the time it takes to write the transformed data into the sink system. This latency depends on the performance of the sink system, the network conditions, and the volume of data being written.


<div class="mermaid" style="display:flex; justify-content:center">
graph LR
    A[Source] -->|Poll| B[SourceTask]
    B -->|Optional Transform| C[Kafka]
    C -->|Consume| D[SinkTask]
    D -->|Optional Transform| E[Sink]
</div>

TL/DR

> * Kafka tail latencies are of the order of single digit milliseconds. 
> * Typical connector pipelines can have anywhere between a few seconds to many minutes of end to end latency. Increasing parallelism usually helps improves latency
> * This lag is by design and can withstand bursty workloads and unavailable systems
> * CDC connectors usually operate with a single thread sourcing a totally ordered WAL. They are prone to larger lag (on high throughput databases) and snapshotting times to backfill existing data. Usually push approaches work better if low latency is a concern

### (3) Stream Processing

Stream processing involves continuously processing data streams in real-time. This typically includes a source processor that reads data from a source Kafka, multiple transformation or other operators (including UDFs) with state stores, and a sink processor that writes processed data back to a sink that supports acknowledgements like Kafka. Each component in this pipeline can introduce latency, and understanding these factors is crucial for optimizing performance.

Operators apply various operations such as filtering, enrichment, aggregation, and joins. These operators can be stateless or stateful. Stateless operations generally incur lower latency as they do not need to maintain any state between records. Stateful operations, however, need to maintain and update a state store, which introduces additional latency. The state store operations involve reading and writing state data, and depending on the implementation, can significantly impact performance.

The sink processor writes the processed data back to Kafka. The latency in this step depends on the performance of the Kafka cluster and the network conditions.

A queryable state layer allows applications to query the state stores directly. This layer provides real-time access to the state maintained by the stream processing application, enabling low-latency queries on the processed data. However, this additional layer usually needs to be backed up by a scalable API layer and metadata augmentation to locate the state store by the key.

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

Streaming databases and stream processing systems do very similar things. One would be inclined to think that streaming databases as syntactic sugar on top of stream processing systems, however this would be very inaccurate. Streaming databases are much more akin to databases, take on state (and persistence) as a first class concern, while completely insulating users from low level APIs used for managing dataflow. For instance, the Timely Dataflow Model, based on NAIAD, emphasizes the coordination of data processing across distributed systems. It introduces the concept of epochs and progress tracking, enabling efficient and scalable data processing. The timely dataflow model supports both cyclic and acyclic data flows, making it versatile for various streaming applications. This is starkly in contrast to DAG based topologies common in stream processing systems. Streaming databases have very solid fundamentals and could easily become relevant for 80% of stream processing use-cases without the complexity of large systems like Flink, Spark (or even libraries like KStreams for that matter).

TL/DR

> * Stream processing pipelines are based on Read-Process-Write loops through parallel topologies. 
> * On an average, they may add between several milliseconds to seconds of latency (or more) depending on the size & shape of the topology, whether they handle stateful operations, the choice of state backend, window length and other considerations. Further, they also have to rely on concepts like watermarks and grace periods to adhere to expectations of completeness and correctness.
> * Shuffles, Checkpointing (if/where supported), Effectively once semantics can all have a significant impact on throughput
> * Streaming databases generally undertake storage as a first class concern and have state store bound latency that is higher than local state stores used by stream processing frameworks


### (4) Real-time OLAP

Real-time Online Analytical Processing (OLAP) systems like Apache Druid, Apache Pinot, and ClickHouse are designed to provide low-latency queries on large volumes of streaming and historical data. These systems are optimized for analytical queries that require fast aggregations, filtering, and complex calculations. They typically ingest data from streaming sources, index and store the data in an efficient (columnar) format, and provide a query interface that allows for high concurrency and fast response times.

Indexed data is stored in deep storage systems such as HDFS, S3, or local disks. The storage layer ensures data durability and availability for historical queries. Query nodes, or brokers, handle incoming queries by distributing them across multiple data nodes. These nodes perform a scatter-gather operation, where subqueries are executed in parallel, and the results are aggregated and returned to the user. Real-time OLAP systems are designed to handle high query concurrency, horizontal scale-out, ensuring that multiple users can run complex queries simultaneously without significant performance degradation.


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


TL/DR:

> * Real-time OLAP systems are the proverbial materialization layer for "large amounts of streaming data with sub-second query SLAs" - especially for systems such as ad-serving, real-time analytics with large scale concurrency
> * For RTOLAP systems to be real-time, it is imperative to maintain tight control on ingestion. Pull-based ingestion with low level consumer optimizations (as opposed to consumer groups) yield lower ingestion latencies
> * Indexes a major role on the query latency. However, a number of table engine nuances (such as support for upserts or the lack thereof), compaction etc need to be managed well, along with optimal sizing of segment sizes on the query nodes, query optimizations, generally avoiding joins by denormalizing tables and strongly considering pre-aggregations and roll-ups on ingest



### (5) The Data Lakehouse

Distributed file systems have been at the backbone of every large scale data architecture over the years. The cloud native era has seen S3 emergency at the core of nearly every data system that desires compute and storage decoupling, including lakes, warehouses, a streaming API like Kafka itself and even transactional databases.

The recent years have seen the coalescence of lakes and warehouses, mainly owing to two important factors, namely the commodification of:

* Open table formats on top of columnar storage formats
* Query Engones: Robust vectorized query execution, predicate pushdowns, etc

While that has been the case, their utility in mainstream “streaming” applications has been relatively low because of prohibitively high latencies on the storage layer (which generally prefers larger files than smaller files) and some structural reasons of the table format themselves. For example, Apache Iceberg, the leading open table formats has major deficiencies with streaming workloads.

However, this is fast changing due to a couple of factors

* The emergence of next-gen formats, such as Apache Hudi and Apache Paimon. Hudi’s Merge on read (MOR) tables are very efficient for streaming ingestion, supports CDC connectors natively, along with schema evolution and deep integrations with processing system. Apache Paimon, which is Flink’s table format, provides some very efficient LSM reuse optimisations and deep integrations with Flink itself makes lakehouse architectures reach closer to the latencies desired, but at much cheaper costs
* Object stores are themselves getting faster (and will keep getting faster). This means there may be times in the future where they may just become viable for a new world order of data architectures.

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

It is inevitable that any architecture that that could benefit from compute-storage separation, geo resillence and cost optimization will build on top of object stores like S3.

TL/DR

> * Lakehouses can easily provide a unified processing and storage layer for most moderate to high latency workloads that need a streaming foundation: Particularly use-cases such as CDC
> * When done well, streaming lakehouses can fill the large void between RTOLAP and traditional lakes and warehouses. It is viable to achieve near-time streaming pipelines with an end to end latency of several seconds to several minutes
> * Not all table formats are equal. While the incumbent table formats largely lean towards traditional batch workloads, some emerging ones provide a solid foundation for streaming
> * As cloud object storage gets faster (ex: S3 Express 1Z), viability of lakehouses for streaming workloads will only get better


### (6) Real-time ML (and datastore bolt-ons)

For a burgeoning data estate with these 5 essentials started out, the more futuristic possibilities of leveraging real-time data are in the AI/ML (including Gen AI space). This necessitates the application of both generic and specialized data stores. For example, time series databases excel at aggregation of data at extremely low latencies on high volume time-series data. Feature stores are emerging as a system of record for managing ML features and reference data, for both online and offline serving as an integrated concern (with low latency). Interest in vector databases, a class of databases that mainly excel at large scale similarity searches, has seen a huge surge mainly due to the advent of GenAI approaches such as RAG, which require context hydration to the LLM at inference time.

While these parts of the stack have been assembled bespoke in the ML niche often on single purpose products, there is a clear potential for unifying and standardizing various parts of the ML platform and Operations stack. The primary concern being, optimizing for inference latency, with models augmented by the freshest data that is available. The final frontier is to enable smarter model operations with continual and incremental learning (a function of both retraining and fine-tuning frequency), while being able to put in controls on evaluation and taming model drift. 

TL/DR

> * Latency Profile: Online feature stores optimize for latencies profiles of the order of milliseconds for serving up real-time features in the path of inference. This usually means that the feature store uses something akin to a Redis, Aerospike or Cassandra. This also needs to be coupled with a robust model serving / API layer and caching. 
> * Vector stores also fall in the same range, but latencies usually fluctuate as a function of the distance metric and the number of vector dimensions. LLM chains and RAG pipelines must consider vector databases in the path as the additional overhead that needs to be optimized.
> * Continual learning is still an area of novelty, coupled with many challenges of explainability and model evaluation, but will emerge as an area, likely building on top of abstractions like 

### Conclusion

Optimizing for latency is hard. Ubiquitous firehose interfaces like Kafka form the lowest common denominator of the distribution and in-motion logistics needed to build real-time experiences that span across the operational, analytical divide. However, these need to be combined with a best in breed stack to process, materialize, query and manage the streaming estate.



