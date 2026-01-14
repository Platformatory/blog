---
layout: post
title: "Flink vs Spark: A Real-World Latency Showdown with Kafka"
author: Shri Veena M P
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

In this blog post, we explore a controlled experiment that compares the latency between Spark and Flink using Kafka as the messaging layer. Let's dive into the data and see how both platforms behave under a high-throughput streaming workload.

---

## The Challenge: Real-Time Data Latency

Imagine you're tracking millions of transactions per second on an online shopping platform. Each transaction needs to be processed and analyzed almost instantaneously to detect fraud, adjust pricing, or update inventory in real time.

The challenge is simple but critical:

> How do you ensure the data is processed quickly without compromising accuracy?

That’s where low-latency stream processing frameworks like **Apache Spark** and **Apache Flink** come into play.

---

## The Experiment: Kafka, Spark, and Flink

For this experiment, we created a distributed data pipeline using:

- **Kafka** as the messaging layer  
- **Apache Spark (PySpark)**  
- **Apache Flink (PyFlink)**  

The goal was to track and measure **end-to-end latency**, from data ingestion to processing and emission.

Kafka was used as both the **source and sink**, simulating real-time data streams. We then compared:

- Spark’s **micro-batch processing model**
- Flink’s **native continuous stream processing model**

---

## Workload Characteristics

The results discussed in this blog are based on a specific type of streaming workload, inferred directly from the Kafka producer used in the setup.

The producer continuously generates **independent, stateless events** containing randomly generated user attributes and timestamps.

Key characteristics of the workload:

- Each message is **self-contained**
- No joins, windowed aggregations, or stateful operations
- No schema enforcement
- High and steady production rate (**10,000 records/second**)

This simulates real-world scenarios such as:

- Clickstream ingestion  
- Telemetry data  
- Log pipelines  

Because the workload is:

- High-throughput  
- Stateless  
- Transformation-light  
- Latency-sensitive  

The observations in this blog apply primarily to **continuous streaming workloads of this nature**. Performance characteristics may differ for batch-heavy, stateful, or aggregation-intensive workloads.

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
A Python consumer tracks latency by comparing timestamps from source to sink and computes statistics such as **p50, p95, and p99 latency**.

---

## Results: Who Wins the Latency Race?

After processing **300,000 records**, several interesting patterns emerged.

### Initial Latency

Both Spark and Flink experienced startup delay, but:

- **Flink started processing ~40 seconds earlier on average**
- Spark incurred higher startup latency due to job initialization and micro-batch scheduling

### Stabilized Latency

Once the pipelines stabilized:

- **PyFlink average latency:** ~**2.12 seconds**
- **PySpark average latency:** ~**6.677 seconds**

### Fluctuating Latency

While PyFlink consistently delivered lower average latency:

- PySpark occasionally outperformed Flink in specific moments
- This highlights that performance can vary depending on workload dynamics

### Key Insight

> PyFlink’s native stream processing architecture makes it better suited for continuous, low-latency streaming workloads, while PySpark’s micro-batch model introduces additional latency.

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

- Spark shows a significantly higher average latency of around **~30 seconds**
- This includes Spark job initialization, micro-batch scheduling, and backlog buildup
- This does **not** represent steady-state performance

In contrast:

- Flink continues processing with **sub-second latency (~0.35–0.55s)**
- Gradually decreasing latency shows Flink catching up without large backlog accumulation

Percentile metrics:

- Spark’s p50, p95, and p99 are all close to ~30 seconds
- Flink maintains low and tightly bounded latency

This snapshot highlights differences during **initial load and job warm-up**.

---

### Snapshot 2: Post-Startup / Active Processing Phase

![Spark vs Flink Steady-State Latency Comparison](/blog/assets/blog-images/spark_vs_flink/spark_flink_steady_state_latency_comparison.png "Snapshot 2: Post-Startup / Active Processing Phase")

This snapshot captures a point after the initial startup phase.

- Spark latency stabilizes around **~0.83–0.94 seconds**
- A visible step-like pattern appears, characteristic of micro-batch execution

On the Flink side:

- Latency remains consistently lower (**~0.32–0.42 seconds**)
- The trend is smoother, reflecting record-at-a-time processing

Percentile metrics confirm:

- Spark shows higher overall and tail latency
- Flink maintains lower values across all percentiles

---

## Setup: How to Recreate the Experiment

Want to try this yourself?

### Clone the Repository

```bash
git clone https://github.com/Platformatory/kafka-spark-flink-latency-analytics-experiment.git
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

## Limitations and Future Work

This experiment focuses on a **stateless, transformation-light streaming workload** to isolate and compare end-to-end latency characteristics of Spark and Flink under high-throughput conditions.

Both Apache Spark and Apache Flink provide rich support for **stateful operations**, including windowed aggregations, joins, and complex event processing. Latency and performance characteristics can differ significantly when state management, checkpointing, and recovery mechanisms are involved.

A comparative evaluation of **stateful streaming workloads** would provide deeper insight into how each system handles state, backpressure, and fault tolerance. This is a natural next step and is planned as a future iteration of this work.

---

## Conclusion: Spark vs Flink — Which One Should You Choose?

For the high-throughput, stateless, and transformation-light streaming workload evaluated in this experiment, PyFlink consistently demonstrates lower end-to-end latency than PySpark.

While PySpark remains a strong choice for batch-oriented and mixed workloads, its micro-batch execution model introduces additional latency that may not be ideal for latency-sensitive streaming use cases.

Flink’s continuous processing model provides a clear advantage when low latency is a primary requirement.

If you're building real-time data pipelines where latency matters, PyFlink is the better fit.

What has your experience been with Spark vs Flink?
Let me know in the comments — and feel free to share your thoughts on the Spark vs Flink debate.

---