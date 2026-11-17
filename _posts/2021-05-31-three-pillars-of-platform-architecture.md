---
layout: post
title:  "The 3 pillars of Platform architecture"
author: p6
categories: [ Platform Engineering, Data, Infrastructure, Kafka, Kong, Kubernetes ]
image: assets/blog-images/platform-arch-model.svg
teaser: How to solve for data, connectivity and infrastructure foundations & platform primitives.
featured: true
hidden: true
toc: true
---

Platform engineering can simplify a complex org's operating model; it can't fix Conway's law. The hard question is what belongs inside the platform boundary. Too greedy stifles autonomy; too loose adds little.

From platform-led transformations that delivered clear business value, three pillars matter most: **infrastructure, data, connectivity.**

## 1. Hybrid cloud infrastructure: Kubernetes

- Hardware is commoditised; containers are the unit of workload. IaaS is fungible.
- Kubernetes is the interface to the cloud. Its declarative control-plane API is the standard any competitor must match.
- Prediction (cf. Atwood's law): any distributed system that can run on Kubernetes eventually runs as an operator. Off managed services, an operator is the next best thing.
- "Too complex" is contradicted by production adoption. Cloud providers and hybrid distributions (Tanzu, OpenShift, Rancher, Nirmata) make it a foundation for app modernisation, not just infra.
- Even serverless, once a public-cloud lock-in, now runs first-class on Kubernetes.

**Advice:** invest in Kubernetes now. It's the chassis for higher-order platforms.

## 2. Data exchange: Kafka

As databases grow, monoliths die. Services own their data, decompose and distribute, and integration needs explode.

- Classic messaging fits poorly: services are smaller and chattier, want eventual consistency, and span hybrid clouds where brokers bottleneck.
- Analytics is converging into operations. Time-to-useful-data must be minimal, and batch big-data falls short.

Answer: event-driven, reactive architecture.
1. Prefer choreography over orchestration.
2. Services exchange data as streams; stream processing keeps state continuously consistent.
3. One eventing backbone for most integrations; an event log is replayable to derive state.

Kafka wins here: (S)EDA, event sourcing, stream processing, data movement; exactly-once processing; rich pub-sub tuning; durable persistence; global-scale, high-throughput, low-latency, fault-tolerant deployments; plus connectors, stream processing and schema management.

> Like Kubernetes, Kafka's protocol is the de facto API for brokered eventing. Competitors (Event Hubs, Pulsar, Redpanda) innovate yet still speak it.

Expect data and event meshes on Kafka as the data plane; domain-owned data products; changelog-driven, event-sourced service integration guarded by AsyncAPI and CloudEvents.

**Advice:** to tame enterprise data, build around a universal stream bus. Operational ROI now; real-time analytics, AI/ML and batch later.

## 3. Connectivity: Kong

APIs are the enterprise's connective tissue.

- SOA created API management beyond ESBs: mediation, composition, security, traffic and quota policy (north-south).
- Microservices add east-west traffic: service meshes with routing, load balancing, circuit breaking, traffic shifting, mirroring and cross-service tracing.
- Most complete gateway + mesh convergence: Kong (Kuma mesh on Envoy, nginx gateway, plugins in Lua/Go/Python/JS); Solo.io to a lesser extent.
- Kong's model is simple: services, upstreams, routes, consumers, targeted declaratively by plugins. Large plugin ecosystem, HTTP/2 and gRPC, VMs and Kubernetes ingress, and often an order-of-magnitude performance lead.

> Gateway–mesh convergence has only begun. Expect Envoy-based data planes to absorb network cross-cutting concerns and gain protocol-aware interception, making the API itself the abstraction.

Also emerging: eBPF networking; HTTP/2 and typed RPC (gRPC, Thrift, Dubbo); GraphQL, AsyncAPI and CloudEvents beyond REST/SOAP. Today's pick: Kong.

APIs are just endpoints until curated into products for developers. Mature API management means API (integration) products: your business as a service.

# Conclusion

A "K3" stack is emerging: **Kubernetes, Kafka, Kong**, covering infrastructure, data and APIs, the three pillars of an enterprise digital platform. Strategise accordingly.
