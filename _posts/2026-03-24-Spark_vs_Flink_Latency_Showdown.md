---
layout: post
title: "Flink vs Spark: A Real-World Latency Showdown with Kafka"
author: ShriVeena
categories:
  [Streaming, Kafka, Apache Spark, Apache Flink, Data Engineering]
image: assets/blog-images/spark_vs_flink/spark_vs_flink.png
featured: false
hidden: false
cat_box_title: Contact Us
ctas:
  - title: Get In Touch
    description: "Have questions or need help designing low-latency data pipelines? Our team is here to help"
    url: "/contact/"

teaser: A real-world latency comparison between Apache Spark and Apache Flink using Kafka under high-throughput streaming workloads.
toc: true
---

## Introduction

In today’s fast-paced digital world, businesses rely on real-time data processing to make quick decisions. But when it comes to building distributed data pipelines, how do you choose between tools like Apache Spark and Apache Flink?

These two giants dominate the streaming data landscape, but which one delivers better performance when it comes to **latency**?

In this blog post, we explore a controlled experiment that compares the latency between Spark and Flink using Kafka as the messaging layer, including both **stateless and stateful workloads**, and **with or without schema enforcement**.

---

## The Challenge: Real-Time Data Latency

Imagine you're tracking millions of transactions per second on an online shopping platform. Each transaction needs to be processed and analyzed almost instantaneously to detect fraud, adjust pricing, or update inventory in real time.

The challenge is simple but critical:

> How do you ensure the data is processed quickly without compromising accuracy, even when the pipelines require stateful operations or schema validation?

That’s where low-latency stream processing frameworks like **Apache Spark** and **Apache Flink** come into play.

---

## The Experiment: Kafka, Spark, and Flink

For this experiment, we created a distributed data pipeline using:

- **Kafka** as the messaging layer  
- **Apache Spark (PySpark)**  
- **Apache Flink (PyFlink)**  

We structured the experiments into **four different pipeline configurations**:

1. **Stateless, no schema**  
2. **Stateless, schema-enforced**  
3. **Stateful, no schema**  
4. **Stateful, schema-enforced**  

The goal was to track and measure **end-to-end latency**, from data ingestion to processing and emission, under increasing complexity.

Kafka was used as both the **source and sink**, simulating real-time data streams. We then compared:

- Spark’s **micro-batch processing model**
- Flink’s **native continuous stream processing model**

---

## Workload Characteristics

The workload was designed to progressively increase in complexity:

- **Stateless pipelines:** Each message is self-contained, no joins or aggregations.  
- **Schema-enforced pipelines:** Kafka messages validated against an Avro schema before processing.  
- **Stateful pipelines:** Operation windowed aggregation is applied.  

Throughput was high (**10,000 records/sec**) to simulate production-like environments for:

- Clickstream ingestion  
- Telemetry pipelines  
- Event logging  

This allowed us to observe how latency changes when moving from simple stateless transformations to fully stateful, schema-validated streaming workloads.

---

## Architecture Overview

![Architecture](/blog/assets/blog-images/spark_vs_flink/architecture_diagram.png "Architecture of the Experiment")

### Kafka Cluster
A multi-broker Kafka cluster was set up in **KRaft mode** to handle message ingestion and delivery.

### Spark Pipeline
Spark reads data using **Structured Streaming**, applies lightweight transformations, and writes the processed output back to Kafka.

### Flink Pipeline
Flink processes the same data as a **continuous stream**, applies transformations, and writes results to Kafka.

### Latency Measurement

**End-to-end latency** is measured by the difference between the **source timestamp** in the Kafka event and the **processed timestamp** recorded at the sink after transformations.  

- **Stateless pipelines**: Each record is processed independently; latency is measured per record as `processed_timestamp - source_timestamp`.  
- **Stateful pipelines**: Some operations (like windowed aggregations or keyed state updates) require buffering or maintaining state across multiple events. Latency is calculated as the **time between the first event entering the state window and the output emission**, resulting in slightly higher per-record latency compared to stateless pipelines.  

**Percentile statistics** (p50, p95, p99) are computed over all records in the stream to provide a realistic view of latency distribution.

---

## Visualizing the Latency: Real-Time Monitoring with Dash

To better understand runtime behavior, we built a **real-time latency monitoring dashboard** using **Dash and Plotly**.

The dashboard displays:

- **Latency per record** for Spark and Flink  
- **Percentile statistics** (p50, p95, p99) updated in real time  

This allows direct visual comparison of both pipelines while they are running.

Here’s a look at the dashboard in action computing the latency metrics in real time:

![dashboard](/blog/assets/blog-images/spark_vs_flink/dashboard.gif "Dashboard in Action")

---

## A Closer Look at the Dashboard

> **Note:** The snapshots shown below are captured at random points in time while the pipelines were running. They are not intended to represent a single fixed phase (startup or steady state), but rather illustrate how latency behaves at different moments during execution.

### Snapshot 1: Early Startup Phase

![Spark vs Flink Startup Latency Comparison](/blog/assets/blog-images/spark_vs_flink/spark_flink_startup_latency_comparison.png "Snapshot 1: Early Startup Phase")

This snapshot was captured immediately after data production started.

During early startup:

- **Stateless, Schema-less Spark** showed a high latency of **~25–30 seconds**, which matches our measured baseline.  
- **Stateless, With Schema Spark** experienced slightly higher latency (~28–32 seconds), as Avro schema parsing and deserialization add startup overhead.  
- **Stateful, Schema-less Spark** incurred additional latency (~30–35 seconds) due to task initialization and per-key state management.  
- **Stateful, With Schema Spark** showed the highest startup latency (~32–38 seconds), combining both state and schema overhead.

In contrast, **Flink pipelines** started processing almost immediately: 

- Stateless, schema-less Flink: ~0.35–0.55 s  
- Schema-enabled Flink: ~0.6–0.8 s  
- Stateful Flink: ~0.5–0.7 s  
- Stateful with schema Flink: ~0.8–1.1 s  

Flink’s **record-at-a-time processing** allows continuous ingestion even when stateful operations or Avro schema parsing are present. Although Avro is more complex to implement in Flink, once configured it introduces only minor startup delay compared to Spark.

Percentile metrics:

- Spark’s p50, p95, and p99 are all close to ~30 seconds
- Flink maintains low and tightly bounded latency

This snapshot highlights differences during **initial load and job warm-up**.

---

### Snapshot 2: Post-Startup / Active Processing Phase

![Spark vs Flink Steady-State Latency Comparison](/blog/assets/blog-images/spark_vs_flink/spark_flink_steady_state_latency_comparison.png "Snapshot 2: Post-Startup / Active Processing Phase")

Once pipelines reach steady-state:

- **Stateless, Schema-less Spark** maintained latency around **0.83–0.94 seconds**, reflecting micro-batch scheduling overhead.  
- **Stateless, With Schema Spark** had slightly higher latency (~1–1.2 seconds) due to ongoing Avro serialization/deserialization.  
- **Stateful, Schema-less Spark** latency increased further (~1–1.3 seconds) because per-key state updates and checkpointing introduce extra processing.  
- **Stateful, With Schema Spark** reached ~1.2–1.5 seconds, combining both state and schema overhead.

Meanwhile, **Flink consistently delivered lower latency** across all four configurations:

- Stateless, schema-less: ~0.32–0.42 s  
- Stateless with schema: ~0.45–0.6 s  
- Stateful, schema-less: ~0.55–0.7 s  
- Stateful with schema: ~0.6–0.85 s  

Percentile metrics confirm:

- Spark shows higher overall and tail latency
- Flink maintains lower values across all percentiles


**Observations:**

- Flink’s **continuous processing model** ensures sub-second latency even with stateful or schema-enabled pipelines.  
- Spark’s micro-batch execution causes higher latency, which accumulates more for stateful pipelines or when Avro schemas are used.  
- **Avro integration in Flink is challenging**, but the payoff is low runtime latency and predictable performance under high-throughput workloads.  
- State management in Flink adds small overhead, but still maintains latency far below Spark for similar workloads.

---

### Key Takeaways Across Pipelines

1. **Early Startup:** Spark suffers from initialization and scheduling delays; Flink starts almost immediately.  
2. **Steady-State:** Flink consistently outperforms Spark in latency, even when state and schema are added.  
3. **Stateful Operations:** Introduce extra latency in both platforms, but Flink handles it more efficiently.  
4. **Schema Enforcement (Avro):** Harder to implement in Flink, yet results in low and stable latency once done.  

> Flink provides the clearest advantage for **real-time, latency-sensitive streaming workloads**, especially when stateful operations or strict schema enforcement are required.

---

## Results: Who Wins the Latency Race?

After processing **over 1 million records** across all configurations:

### Stateless Pipelines

- **PyFlink average latency:** ~**2.12 seconds**  
- **PySpark average latency:** ~**6.68 seconds**  
- PyFlink’s continuous streaming model consistently outperformed Spark micro-batches.

### Schema-Enforced Stateless Pipelines

- Slight overhead from schema validation  
- **PyFlink:** ~**2.35 seconds**  
- **PySpark:** ~**7.1 seconds** 
- Flink still maintains a strong lead in latency.

---

## Stateful Pipelines

Stateful operations introduce higher complexity due to state management and checkpointing. We evaluated both **with and without schema enforcement**.

### Stateful, No Schema

- PyFlink average latency: ~**3.5–4.0 seconds**  
- PySpark average latency: ~**8–9 seconds**  
- Flink handles keyed state efficiently, keeping latency low despite state overhead.

### Stateful, With Schema (Avro)

- PyFlink average latency: ~**3.8–4.2 seconds**  
- PySpark average latency: ~**9–10 seconds**  
- Avro deserialization in Flink is tricky, but once configured, it provides **validated records with minimal impact on latency**.  
- Spark’s micro-batch model introduces more noticeable spikes due to batching and checkpointing.

---

## Setup: How to Recreate the Experiment

Want to try this yourself?

### Clone the Repository

```bash
git clone https://github.com/Platformatory/kafka-spark-flink-latency-analytics-experiment.git
```
### To experiment with stateless and schemaless data pipeline

```bash
git checkout -b stateless-noschema
```
### To experiment with stateless data pipeline with schema

```bash
git checkout -b stateless-withschema
```
### To experiment with schemaless data pipeline with stateful function

```bash
git checkout -b stateful-noschema
```
### To experiment with data pipeline with stateful function and with Schema

```bash
git checkout -b stateful-withschema
```

### Build and Run the Containers

Run with logs enabled:
```bash
docker compose up --build
```
Run in detached mode:
```bash
docker compose up -d --build
```
## Monitor the Latency

Once all services are running, open the following URL in your browser:

```
http://127.0.0.1:8050/
```

This dashboard computes and visualizes latency metrics in real time for both Spark and Flink pipelines.

---

# Conclusion: Spark vs Flink — Insights Across All Pipelines

Across **stateless vs stateful** and **schema-less vs Avro schema** pipelines, PyFlink consistently demonstrates lower end-to-end latency than PySpark.

While PySpark remains a strong choice for batch-oriented or mixed workloads, its micro-batch execution model introduces inherent latency, especially noticeable during early startup (~25–38 s depending on configuration).

Flink’s continuous, record-at-a-time processing model handles both stateless and stateful workloads efficiently, even with Avro schema enforcement. Although Avro integration adds setup overhead, it provides predictable, low-latency results once running. Stateful operations introduce slight additional latency compared to stateless pipelines, but Flink still keeps p95 and p99 values tightly bounded.

> If your goal is low-latency, high-throughput streaming with complex state or schema requirements, PyFlink provides a clear advantage over PySpark.

We’d love to hear your experiences with Spark vs Flink. Share your thoughts and insights in the comments!

---