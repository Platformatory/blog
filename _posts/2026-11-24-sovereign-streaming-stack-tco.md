---
layout: post
title: 'The Case for Self-Hosting Kafka: TCO Against Managed Kafka'
author: p6
categories:
- Kafka
- Kafka Operations
- Cost
- Kubernetes
image: assets/blog-images/sovereign-streaming-stack-tco/hero.svg
featured: true
weight: 8
hidden: false
teaser: "Are you overpaying for managed Kafka?"
description: 'Kafka TCO compared: when self-hosting Kafka on Kubernetes beats managed
  Kafka services and BYOC, where the bill goes, and when self-hosting doesn''t pay.'
toc: true
---

At Current 2026 in San Francisco on 5 November, I gave a lightning talk on running a sovereign streaming cloud yourself, on BYOC or plain Kubernetes.[^current]  Its premise was price: on-premises hardware and the long tail of cloud providers are still the cheapest tier per GB/s streamed, by an order of magnitude or more against some hyperscalers. Here is the arithmetic behind that.

You already run Kafka yourself. Maybe it's upstream Kafka on VMs, Strimzi on Kubernetes, Cloudera's streaming stack in your data centre or Confluent Platform under licence. Every renewal cycle, someone proposes moving it to a managed service and getting out of the operations business.

Run the numbers before you agree. At 2 GB/s of writes with a week of retention, Confluent Cloud's list prices come to about $870,000 a month for Kafka alone. Nobody at that scale pays list. But to match what the same workload costs you to run on AWS, the discount has to reach 62%, or 73% once you count the PrivateLink charges private access adds to your own AWS bill, and on Azure or Oracle Cloud it has to be about 95%.   The question worth answering is when running your own stack wins, by how much, and when you should stop.

My answer is that above a modest throughput, with a platform team you already have, self-hosting wins, and it wins harder the more of the stack you count and the stricter your rules about who runs it. The rest of this post is the working, including the cases where it loses.

* * *

## The bill is the network

Managed Kafka is priced per gigabyte for a reason. A provider running a three-zone cluster pays for every byte that crosses a zone boundary, for the disks that hold three replicas, and for the people on call, and the per-GB fee recovers all three in one number. Confluent Cloud's Enterprise clusters list at $0.02 to $0.05 per GB in and out, $0.08 per GB-month of storage and $1.75 to $2.25 per elastic unit-hour.[^ccloud]  Amazon MSK prices differently: a `kafka.m7g.2xlarge` broker is $0.816 an hour, twice an EC2 instance of the same size, storage is $0.10 per GB-month on brokers and $0.06 tiered, and replication between brokers is free.[^msk]

Run Kafka yourself and those prices turn back into parts. The part that swings the bill is traffic between zones in one region:

- **AWS:** $0.01 per GB in each direction, so $0.02 for every GB that crosses.[^aws-xaz]
- **Google Cloud:** $0.01 per GiB between zones in a region.[^gcp-net]
- **Azure:** no charge between availability zones since 2024.[^azure-az]
- **Oracle Cloud:** no charge within a region, across availability domains.[^oci-net]

A cluster with three replicas across three zones crosses a zone boundary $$x$$ times for every GB a producer writes:

$$x = (RF - 1) + \tfrac{2}{3} + \tfrac{2}{3}\,F\,(1 - r)$$

Two replicas live in other zones, a producer reaches a leader in another zone two times in three, and each of $$F$$ consumer groups does the same unless it fetches from a replica in its own zone ($$r = 1$$, fetch-from-follower, KIP-392). With three consumer groups, $$x$$ is 4.67 without in-zone fetching, 2.67 with it, and 0.67 when brokers replicate through object storage instead of to each other.

Take a workload stated the way its owner would state it: 2 GB/s of writes on average, seven days of retention, three-zone availability, three consumer groups. That's 5,184 TB written a month, about 50 brokers of 8 vCPUs and 32 GiB each.[^vm]   On AWS, per month at list prices:

| Kafka on AWS, 2 GB/s, 7 days | Per month |
|---|---|
| Confluent Cloud Enterprise, list, over PrivateLink | $969,134 |
| Confluent Cloud Enterprise, list | $872,168 |
| Self-run, 1 day on broker disks, no fetch-from-follower | $584,611 |
| Self-run, 1 day on broker disks, fetch-from-follower | $377,251 |
| Self-run, 4 hours on broker disks, fetch-from-follower | $328,723 |
| MSK, 1 day on broker storage, then tiered | $240,038 |
| MSK, 4 hours on broker storage, then tiered | $183,878 |
| Self-run, diskless | $119,693 |

Confluent Cloud has no networking line on its own bill, and its price assumes your clients can reach it. At this scale they reach it privately, and the cluster lives in Confluent's account, so every byte crosses a private boundary that your cloud provider bills you for.[^ccloud-net] For the 20.7 PB a month of client traffic here, on AWS:

- **PrivateLink:** hourly endpoint fees plus tiered data processing, about $97,000 a month.
- **Transit Gateway**, for Dedicated clusters: $0.02 per GB processed, billed to the sending account, about $104,000 for the produce side alone and up to $415,000 if all of it lands on yours.
- **Private Network Interface**, for Enterprise and Freight clusters: no processing charge, but zone-crossing charges wherever clients and brokers aren't aligned, from nothing to about $276,000 if two-thirds of the traffic crosses a zone.
- **VPC peering**, for Dedicated clusters: no processing charge, and no transitive routing, so it stops scaling at a handful of VPCs.

MSK and a self-run cluster sit in your own VPC, so clients in that VPC or a peered one pay only the zone crossings already in the table. MSK's multi-VPC connectivity, for clients in other accounts, adds $0.006 per GB, about $124,000.[^privatelink]  Counting PrivateLink, the discount Confluent Cloud needs to match self-run Kafka on AWS goes from 62% to 73%, and to match MSK from 79% to 90%.

Three levers do almost all the work, and they're all on your side of the fence:

- **Fetch from followers.** Reading in-zone removes $207,360 a month, more than the cluster's compute fourteen times over. It's a client setting, `client.rack`, and a broker setting, `replica.selector.class`.
- **Tier aggressively.** Keeping 4 hours on broker disks instead of a day cuts block storage from $62,208 to $10,368, and object storage is a fraction of the price per GB.
- **Stop paying to replicate.** On AWS, replication is most of what's left. MSK waives it, which is why MSK beats a replicated self-run cluster there. A diskless cluster that replicates through S3 removes it too and beats MSK by a third. The price is produce latency: a write is acknowledged only once it's in object storage, so latency-sensitive topics stay on replicated brokers. Upstream Kafka accepted diskless topics in March 2026 but hasn't released them; diskless distributions run today.[^diskless]

**Scale with demand, where the system allows it.** Replicated brokers don't scale in quickly, because removing one means moving its partitions, which takes hours at this size. Diskless brokers hold no data, so they scale like compute. If the 2 GB/s is an average over a day that peaks at 4 GB/s, a diskless cluster averages about 50 brokers where a fixed one needs 100, which is $14,717 a month on AWS. That's small next to the network, because compute is under 5% of the Kafka bill, and the same fact means the sizing of 40 MB/s per broker barely moves any total. Autoscaling pays far more for Flink and ClickHouse.

The same workload self-run on the other clouds, four hours on broker disks and fetching from followers, is $198,673 on Google Cloud, $45,768 on Azure and $44,422 on Oracle Cloud, against $872,168 for Confluent Cloud before private networking.  Independent arithmetic agrees on what dominates. Stanislav Kozlovski's model of an optimised, self-hosted 1 GiB/s cluster with seven days of retention, at late-2024 prices on older instance types and gp2 disks, comes to about $180,000 a month on AWS, $93,000 on Google Cloud and $29,000 on Azure, with cross-zone traffic the largest line, and he finds a diskless BYOC service cheaper than self-hosting only on AWS, by about a third.[^kozlovski]  His figures differ from ours in detail. The ranking of clouds and the dominance of the network hold in both.

**Off the hyperscalers.** The long-tail and regional clouds price the network like Azure and Oracle Cloud, with nothing charged for traffic on a private network inside a site, and undercut them on compute. The same workload self-run, four hours on broker disks, infrastructure per month:[^longtail]

- **DigitalOcean:** $49,472.
- **Akamai Cloud (Linode):** $51,906.
- **Hetzner:** $23,810, with each 8-vCPU broker at €118 a month.

![Monthly infrastructure cost of self-run Kafka at 2 GB/s by cloud: AWS $329k, mostly cross-zone traffic; Google Cloud $199k; Azure $46k; Oracle Cloud $44k; DigitalOcean $49k; Akamai $52k; Hetzner $24k. Model estimate at list prices; long-tail regions are single sites.](../assets/blog-images/sovereign-streaming-stack-tco/longtail.svg)

Against what you'd otherwise buy on a hyperscaler, Confluent Cloud at list, the crossover falls to 4 or 5 MB/s, and to between 11 and 14 MB/s at half off. There are two catches. These regions are single sites, so the three replicas share one and are spread only across racks; surviving the loss of a site means a second one, and on DigitalOcean a replica in another datacenter costs $0.01 per GiB, about $48,000 a month at 2 GB/s. OVHcloud's 3-AZ regions are the exception, with no charge between zones.  The other catch is capacity: fifty dedicated servers in one location isn't a given, and Hetzner listed this size as unavailable in Nuremberg on the day we priced it. Where a long-tail cloud sells managed Kafka, the markup is small. DigitalOcean's nodes cost about 3% more than the Droplets underneath, and the premium sits in storage, $0.21 per GiB-month on the cluster against $0.10 for a Volume, so self-hosting there buys control of versions, tiering and sizing more than it buys savings.

Don't take any of these numbers on trust, ours included. Fetch-from-follower adds read latency, short broker retention sends lagging consumers to object storage, and diskless adds produce latency. Measure each on your own traffic before you commit, by standing the same stack up on each candidate substrate and replaying the real workload. That's cheap only when provisioning a cluster is an API call and tearing it down is another, which is one more reason to own the platform.

## Your distribution already has the levers

If you self-host today, most of what cuts the bill is already in the software you run.

- **Upstream Kafka.** Tiered storage has been production-ready since 3.9, in November 2024.[^kafka39]  Fetch-from-follower has been there since 2.4. Kafka 4.0, released in March 2025, runs only in KRaft mode: ZooKeeper is gone, and a ZooKeeper cluster has to migrate to KRaft, with 3.9 as the bridge, before it can upgrade.[^kafka40]  One less distributed system to run is the cheapest operational win Kafka has shipped in a decade.
- **Strimzi.** The operator has been a CNCF incubating project since February 2024.[^strimzi]  A platform team that runs anything on Kubernetes can run Kafka with it, and every upstream lever above arrives with the Kafka version it deploys.
- **Cloudera.** Streams Messaging bundles Kafka with Streams Messaging Manager, Streams Replication Manager, Schema Registry and Cruise Control, and Cloudera Runtime 7.3.2 ships Kafka 3.9.1.[^cloudera]  That puts Cloudera estates exactly at the bridge release: the KRaft migration is coming either way, so plan it as part of deciding where the next five years of the platform run.
- **Confluent Platform.** Tiered Storage, Cluster Linking, role-based access control and Self-Balancing Clusters are licensed features of Confluent Server; Schema Registry and REST Proxy are community-licensed.[^cp-license]  Upstream Kafka now covers tiered storage, Cruise Control covers rebalancing, and MirrorMaker 2 covers cross-cluster replication, translating offsets where Cluster Linking preserves them. If you use the licensed features heavily, the licence earns its keep. If you mostly use tiered storage, check what you're paying for.

**The licence.** This is the one line where upstream Kafka wins outright, because its price is zero. Confluent Platform lists at $12,000 per production node a year on Gold and $15,000 on Platinum, with pre-production and DR nodes at half that. Cloudera listed Base at $10,000 a node a year before capacity and storage terms, and now quotes Streams Messaging on request. Redpanda's self-managed licence is quote-only, so it isn't modelled here.[^licences]  A per-node licence is a tax on node count, and Kafka's node count follows throughput. For the 2 GB/s workload, fifty brokers and three KRaft controllers, production only:

| Licence, 2 GB/s | Per month | Added to self-run on AWS | Added to self-run on Azure |
|---|---|---|---|
| Upstream Kafka or Strimzi | $0 | 0% | 0% |
| Cloudera Base | $44,167 | 13% | 97% |
| Confluent Platform Gold | $53,000 | 16% | 116% |
| Confluent Platform Platinum | $66,250 | 20% | 145% |

On AWS the licence hides behind the network bill. Wherever the network is free, on Azure, Oracle Cloud and the long-tail clouds, a Confluent Platform licence costs more than the brokers, disks and object storage together. If you stay on a licensed distribution, run fewer, bigger brokers: a node can have up to 56 cores, and if throughput scales with cores, 32-vCPU brokers carry the same workload on 16 nodes for $16,000 a month on Gold. If tiered storage is what you mostly use the licence for, upstream Kafka gives it to you for nothing.

![Monthly cost of self-run Kafka at 2 GB/s with a Confluent Platform licence added. The Gold licence adds 16% on AWS, 27% on Google Cloud, 116% on Azure, 119% on Oracle Cloud, 107% on DigitalOcean, 102% on Akamai and 223% on Hetzner. Model estimate at list prices.](../assets/blog-images/sovereign-streaming-stack-tco/licence.svg)

Every one of these teams already carries the expertise that a move to managed is supposed to save. The question is whether the platform around Kafka makes that expertise cheap to apply.

## Who runs it

People are the cost on the other side, and the realistic question is whose people. A company streaming at this scale already has a platform team with broad cloud and Kubernetes skills, and Kafka joins its portfolio as one more workload, on a rotation that already exists. Three people costs follow, and they scale differently:

- **An expert tribe.** Someone has to know Kafka deeply: partitioning, client tuning, the failure modes. Everyone needs that, whether the cluster is managed or not and whether the experts are employed or retained, so it sits on both sides of the comparison and cancels. The model puts it at one engineer.
- **The platform team's share.** Upgrades, patching, certificates, capacity and requests from application teams: a fifth of an engineer per cluster plus a 250th per broker for a typical platform team, scaled by how well it operates, against a twentieth per cluster for a managed service.
- **An expertise hedge.** Retained depth for the major incident a generalist team can't close alone: a twentieth of an engineer per cluster plus 0.003 per broker, sized below.

All three are assumptions, priced at $130,000 for a fully loaded engineer-year, the average of an onshore engineer at $200,000 and an offshore one at $60,000, and they're the inputs most worth replacing with your own.  For $$N$$ clusters of $$B$$ brokers each writing $$T$$ MB/s, with an expert tribe of $$E$$ engineers, an operating-capability coefficient $$\kappa$$ (1 for a typical platform team) and a discount $$d$$ off the managed list price:

$$C_{\text{self}} = N\big(c_{\text{vm}} + c_{\text{disk}} + c_{\text{obj}} + 2592\,T\,x\,p_{z}\big) + \big(E + N\big(\kappa\,(0.2 + 0.004B) + 0.05 + 0.003B\big)\big)\,\frac{L}{12}$$

$$C_{\text{managed}} = (1 - d)\,N\big(c_{\text{units}} + 2592\,T\,(1 + F)\,g + c_{\text{storage}}\big) + (E + 0.05N)\,\frac{L}{12}$$

where 2,592 turns MB/s into GB a month, $$p_z$$ is the price per GB crossing a zone, $$g$$ the managed price per GB moved and $$L$$ a fully loaded engineer-year. Because the tribe sits on both sides, the crossover barely depends on how many clusters you run. The discount decides it.

![The throughput per cluster at which running Kafka yourself becomes cheaper than Confluent Cloud, for one cluster at $130,000 an engineer-year. At list: AWS 8 MB/s, Google Cloud 6, Azure 5, Oracle Cloud 4. At 30% off: 18, 12, 9 and 8. At 50% off: 53, 23, 14 and 12. At 70% off against diskless self-run: 41, 32, 26 and 24.](../assets/blog-images/sovereign-streaming-stack-tco/crossover.svg)
*List prices, US regions, November 2026; four hours on broker disks; staffing and broker sizing as assumed above.*

| Crossover, MB/s per cluster | AWS | Google Cloud | Azure | Oracle Cloud |
|---|---|---|---|---|
| At list | 8 | 6 | 5 | 4 |
| 30% off list | 18 | 12 | 9 | 8 |
| 50% off list | 53 | 23 | 14 | 12 |
| 70% off list | never | 77 | 27 | 24 |
| 70% off list, diskless self-run | 41 | 32 | 26 | 24 |
| At list, three-engineer self-run base | 87 | 69 | 60 | 59 |
| 50% off list, three-engineer self-run base | 462 | 204 | 122 | 121 |

Over PrivateLink, which is how most private AWS estates will connect, the AWS crossover falls to 6 MB/s at list, 10 at 30% off, 17 at 50% off and 41 at 70% off: even a 70% discount stops protecting a mid-sized cluster.

At 2 GB/s the people difference is about $6,000 a month, 1.6 engineers against 1.05, against hundreds of thousands in infrastructure.

One engineer plus a share of a platform team can't hold an on-call rota of its own, and a head of platform who wants one will staff it with three. The last two rows of the table give self-run that base, two engineers more than the managed side carries, about $21,700 a month. The crossover at list rises to 87 MB/s on AWS and about 60 on the other three clouds, and at half off to 462 on AWS and about 120 on Azure and Oracle Cloud. That's a real move for mid-sized clusters and none at all for the 2 GB/s workload.  Below a few tens of MB/s per cluster it decides the answer; above that, the discount does, and on Azure and Oracle Cloud even a 70% discount doesn't close the gap. The figures hold while the estate is one shape of Kafka on one cloud, and while the platform team keeps the people who learned it.

**How good do you have to be?** Every comparison of self-hosted and managed Kafka hides an assumption about how well the self-hosting team operates. Here it's one number, $$\kappa$$, the multiplier on the platform team's share, and the honest way to use it is to push it both ways:

- **By hand, $$\kappa = 2$$:** runbooks, tickets and a terminal; every upgrade is a project.
- **A typical platform team, $$\kappa = 1$$:** an operator such as Strimzi, GitOps, decent dashboards.
- **A self-service platform, $$\kappa = 0.5$$:** provisioning, scaling, upgrades and recovery behind one API with durable workflows, so generalist platform engineers operate Kafka without being Kafka specialists.
- **Agents under contracts, $$\kappa = 0.25$$:** the same platform with agents doing the routine work through checked operations, as described further down.

| Self-run is cheaper above, MB/s per cluster | By hand | Platform team | Self-service | Agents |
|---|---|---|---|---|
| Confluent Cloud, list | 17 | 8 | 3 | 1 |
| Confluent Cloud, list, over PrivateLink | 12 | 6 | 2 | 1 |
| Confluent Cloud, 50% off | 85 | 53 | 29 | 17 |
| MSK Serverless, diskless self-run | 8 | 5 | 3 | 2 |
| MSK Express, diskless self-run | 60 | 32 | 20 | 12 |
| MSK Standard, diskless self-run | 147 | 61 | 14 | 1 |
| Engineers for twenty 10-broker clusters | 12.2 | 7.4 | 5.0 | 3.8 |

Even run by hand, self-hosting beats Confluent Cloud's list price above 17 MB/s per cluster and MSK Serverless above 8. Capability matters most against the cheapest managed option: diskless self-run beats MSK Standard above 147 MB/s per cluster when run by hand, and above 14 with a self-service platform. Replicated self-run on AWS never beats MSK Express at any capability, and beats MSK Standard only for a cluster of a couple of MB/s run by agents, because the replication traffic it pays for and they don't is infrastructure, and no amount of operational skill removes it. At 2 GB/s the operating model moves the saving against MSK Standard only from 28% to 31%; capability decides where the line sits for mid-sized clusters, and the architecture decides the rest.

**The hedge.** Broad cloud and Kubernetes skill covers the routine. A major incident, such as a lost controller quorum, an unclean leader election or a reassignment that saturates the network, needs someone who has seen it before, reachable within the hour. What that's worth grows with the cluster:

- **What stalls.** An hour of outage at 2 GB/s is 7.2 TB of writes that producers have to buffer or drop, with every consumer downstream waiting. At 500 MB/s it's 1.8 TB, at 100 MB/s 0.36 TB.
- **What a misstep costs.** Replacing a broker means copying its data from the replicas. At 40 MB/s of writes per broker and three replicas, a broker holds about 10 TB with a day of local retention, 14 hours of rebuilding at a throttled 200 MB/s. With a week on local disk it's 73 TB and four days; with four hours, 1.7 TB and under two and a half hours; a diskless broker has nothing to rebuild. A wrong move in a major incident tends to cost at least one rebuild.

Priced as insurance, a hedge costing $$H$$ a year pays when an hour of stalled streaming costs the business more than $$H / (\lambda\,\Delta T)$$, with $$\lambda$$ major incidents a year and $$\Delta T$$ the hours the expertise saves. With one incident a year and one rebuild saved, the model's hedge for the 2 GB/s cluster, $26,000 a year, pays above about $10,800 an hour at four hours of local retention, still a low bar for a cluster moving 7.2 TB an hour. Keep a day on local disk and the rebuild takes 14 hours, so the bar falls to about $1,800 an hour. For a 100 MB/s cluster the hedge is $7,700 a year. Aggressive tiering buys cheaper storage and less risk to insure in the same move.

**The lock-in.** Weigh the hedge against what a managed service costs beyond its price: the leverage it holds at renewal. Leaving means running both for the length of a migration. At list prices for the 2 GB/s workload, three months of parallel running is $2.6 million before any engineering, and that's roughly how far the price can move against you before leaving pays.  A self-run stack on open-source Kafka has an exit cost too, but nobody across the table gets to set it.

**Two ways to buy down the people term.** Both cost money, and both change the model's inputs.

- **Retain the expertise.** A support contract with Kafka specialists who carry the 3 a.m. incident turns the hedge into a fixed fee and moves the operational risk off your team. It makes sense when an outage costs more per hour than the hedge's break-even, or when the people who know Kafka might leave.
- **Lower $$\kappa$$.** A self-service platform makes Kafka operable by the platform engineers you already have. It makes sense when the estate is growing faster than the team, or when the same team runs Kafka, Flink and ClickHouse across several substrates.

Most large estates end up with both: a platform that keeps day-to-day operations cheap, and specialists on call for the day it isn't.

**The comparison that applies.** It depends on what you'd buy instead.

- **A multi-cloud managed service, such as Confluent Cloud:** the cost case above holds in full, and running your own also removes the private-networking layer between applications and the service, with the data in accounts you control.
- **The hyperscaler's own Kafka, or BYOC:** the cost case is narrow. MSK beats replicated self-run on AWS; diskless self-run beats it at large sizes, and the numbers by MSK flavour follow below.  Self-hosting here is a hedge on cost and lock-in more than a saving: it keeps the option to move, and it keeps who operates the system your decision.
- **Kafka that writes straight into the lakehouse:** Confluent's Tableflow materialises topics as Iceberg or Delta tables behind its own catalogue, MSK Express brokers deliver to Amazon S3 Tables since July 2026, and Aiven's Iceberg Topics does it in Kafka's tiered-storage path as an experimental Apache-2.0 project.[^lakehouse]  The tables are open formats; the writer and often the catalogue are the provider's. The same reasoning applies: a modest cost and lock-in hedge, worth having when the lakehouse is where your data will live for a decade.
- **A private deployment, on metal or in a regulated or air-gapped estate:** the people calculus changes, below.

**Against Amazon MSK.** MSK comes in three shapes, and they price differently. Standard brokers charge per broker-hour plus disk and tiered storage, with replication free. Express brokers charge per broker-hour, $0.01 per GB written and $0.10 per GB-month for storage that scales on its own, and each size has a published sustained throughput. Serverless charges $0.75 per cluster-hour, $0.0015 per partition-hour, $0.10 per GB in, $0.05 per GB out and $0.10 per GB-month, and a cluster tops out at 200 MB/s in and 400 MB/s out.[^msk-shapes]  With four hours on broker disks, fetch-from-follower everywhere it applies and the people from the model, for one cluster in US East:

| Self-run beats MSK above, per cluster | Replicated self-run | Diskless self-run |
|---|---|---|
| MSK Serverless | 5 MB/s | 5 MB/s |
| MSK Express | never | 32 MB/s |
| MSK Standard | never | 61 MB/s |

| At 2 GB/s, per month with people | MSK | Diskless self-run | Saving |
|---|---|---|---|
| MSK Serverless, 15 clusters | $1,437,424 | $137,026 | 90% |
| MSK Express | $302,662 | $137,026 | 55% |
| MSK Standard | $195,253 | $137,026 | 30% |

Serverless is a per-GB service with a size cap, so at scale it costs more than Confluent Cloud and has to be sharded across 15 clusters to carry 2 GB/s. Express charges for every gigabyte written and stored without tiering, so a week of retention costs it $121,000 a month in storage alone. Standard MSK is the hard one to beat: replicated self-run never does, and diskless wins by about 30% at 2 GB/s and only above about 61 MB/s per cluster. The model sizes MSK Standard brokers like self-run ones, at 40 MB/s each, since AWS publishes no per-broker figure for them.

## The stack compounds

Nobody runs only Kafka. A typical estate runs Flink beside it, Kafka Streams applications, which are widely deployed because they ship as a library, and increasingly ClickHouse for analytics on live data. Each has a managed equivalent, and each adds its own premium. The sizes below come from one example estate; yours will differ.

- **Flink.** AWS's managed Flink charges $0.11 per KPU-hour, a KPU being 1 vCPU and 4 GB, plus one extra KPU per application and 50 GB of storage per KPU at $0.10 per GB-month.[^msf]  An `m7i.2xlarge` has the same 4 GB per vCPU at about $0.05 per vCPU-hour. For 200 vCPUs across 20 applications that's $18,666 a month managed against $7,358 self-run, 2.5 times. Flink is compute-heavy, so scaling with demand pays here: sized for a 2x peak, the self-run figure doubles.
- **Kafka Streams.** The application runs on your compute either way, but its repartition and changelog topics run through Kafka. At 200 MB/s of internal-topic writes read once, that's $36,288 a month of per-GB fees on Confluent Cloud, and on Azure or Oracle Cloud about $1,400 of extra brokers.
- **ClickHouse.** ClickHouse Cloud charges $0.29846 per compute unit-hour (8 GiB and 2 vCPUs) on its Scale tier, $25.30 per TB-month of storage, and $0.04 per GB for ClickPipes to ingest from Kafka.[^clickhouse]  Two 256 GiB replicas over 50 TB, ingesting 200 MB/s, come to $36,276 a month, $20,736 of it the per-GB ingest fee. Self-run on equivalent VMs, with object storage and half the data on local disk per replica, it's $9,859, without the people who'd run it; ClickHouse Cloud's price includes them.

| Stack on AWS, per month | Kafka | Flink | Streams topics | ClickHouse | Total |
|---|---|---|---|---|---|
| Confluent Cloud, managed Flink, ClickHouse Cloud | $872,168 | $18,666 | $36,288 | $36,276 | $963,398 |
| MSK, managed Flink, ClickHouse Cloud | $183,878 | $18,666 | $9,890 | $36,276 | $248,710 |
| Self-run, replicated Kafka | $328,723 | $7,358 | $29,120 | $9,859 | $375,060 |
| Self-run, diskless Kafka | $119,693 | $7,358 | $8,384 | $9,859 | $145,294 |

The same self-run stack is $63,613 a month on Azure and $55,922 on Oracle Cloud.  The totals depend on the example's sizes; the structure doesn't. Managed services put their fees at every boundary a byte crosses. A gigabyte that goes from a producer through a managed Kafka service into ClickHouse Cloud pays $0.035 in, $0.035 out and $0.04 into ClickPipes, plus about half a cent each way if it travels over PrivateLink, roughly $0.12 end to end. Self-hosted on AWS with fetch-from-follower, the same gigabyte pays $0.053 in zone crossings; on Azure or Oracle Cloud it pays nothing.  Every engine you add to a managed estate adds another toll booth. Every engine you add to your own platform shares the same machines, the same network and the same team.

## On metal and behind an air-gap

The cloud comparison is the generous case for managed services, because there at least the managed option exists. In a bank's data centre, a telco's network, a defence enclave or any estate whose rules say who may operate the system, there's no per-GB service to buy. The realistic alternatives are a commercial distribution under subscription, a vendor's dedicated deployment or an outsourced operator, each with its own premium and one more third party in every audit. Bare metal removes the line that dominates the cloud tables, since traffic between racks in your own data centre costs nothing per gigabyte, and self-hosting the open-source stack removes the licence. It adds costs the cloud hides: hardware, power, space and cross-connects, a team that racks and replaces machines, procurement lead times, and capacity bought for the peak because nothing scales on demand. On metal, the lever that replaces autoscaling is consolidation: Kafka, Flink and ClickHouse sharing machines and headroom, which works only when one platform schedules all of them. Without per-GB fees or licences, that usually comes out ahead of a subscription; check it against your own hardware prices.

The people term changes most. There's no managed service holding the pager and rarely a platform team that already runs systems like this inside the boundary, so the expertise has to be concentrated: a dedicated rotation, in the model six engineers at half time plus a tenth of an engineer per cluster and a hundredth per broker, 3.6 engineers for one 50-broker cluster against 1.6 in the cloud.  Private estates pay that for control, and they should plan for it from day one.

Vendors answer sovereignty with bring-your-own-cloud: the data plane runs in the customer's account and the vendor keeps the control plane.[^byoc]  That settles where the bytes live. Ownership of operators moves too: Confluent, the largest managed Kafka provider, became part of IBM in March 2026.[^ibm]  Sovereignty has three dimensions, and BYOC covers one of them.

- **Infrastructure:** where it runs, whether on-premises, BYOC, at the edge or air-gapped.
- **Operations:** who provisions, upgrades, recovers and troubleshoots, and from where.
- **Dependencies:** what can be replaced, including identity, certificates, licences, container registries, AI models and the agents that act on the system.

![Three ways to run streaming. Fully managed: the vendor holds both the data plane and the control plane. Bring your own cloud: the data plane sits inside your boundary and the control plane stays with the vendor. Sovereign: both planes sit inside your boundary.](../assets/blog-images/sovereign-streaming-stack-tco/planes.svg)

A stack that's fully inside the boundary also exposes less. Reaching a managed service privately is a project of its own: on AWS, Confluent Cloud offers PrivateLink, VPC peering, Transit Gateway and a Private Network Interface, and with private networking an on-premises data centre can't connect to it directly.[^ccloud-net]  Each path is an endpoint, a route table and a policy to get right. Behind an air-gap, Kafka, Flink and ClickHouse have no route from the internet, so a remotely exploitable vulnerability needs another way in before it matters, and patches go in on your own schedule. The air-gap moves the risk rather than removing it. The way in becomes the artefacts you mirror, the people with access and the patches you apply later than everyone else, so mirrored artefacts need signatures that are checked and patching needs a cadence. In connected estates the fleet's connection to its management plane should be outbound-only, and an air-gap removes even that.

There's an engineering dividend as well. A multi-tenant service has to optimise for every customer's workloads at once, behind portable defaults. A platform scoped to one company knows its workloads and constraints, so it can choose the cloud whose zones are free, fetch from followers, tier to the hour and adopt diskless storage. Each of those is worth more than any compute discount, and each is a choice a shared service makes for you.

## A mixed estate multiplies

Most self-hosters don't have one Kafka. They have two lists. One is what they run: upstream Kafka, a commercial distribution under their own licence, a diskless implementation, an edge broker, with Connect and Flink beside them. The other is where they run it: one or more clouds, their own Kubernetes, VMs in a data centre, edge sites, an air-gapped enclave. Handled pairing by pairing, $$m$$ things to run on $$n$$ places to run them is $$m \times n$$ sets of provisioning, upgrade and recovery procedures, each a runbook, a test and a place to be wrong. Four distributions on five kinds of substrate is 20, and every new substrate adds four more.  This is where self-hosting gets its bad reputation, and it's an engineering problem with an engineering answer.

Turn the product into a sum. If the platform speaks to each distribution through one interface and to each substrate through another, it maintains $$m + n$$ adapters, nine in the example, and a new substrate adds one.  The two sides never separate completely. An air-gap changes how images and identity reach a cluster, and some distributions upgrade differently from others, so the design rule is to keep the interactions that matter visible and hide the rest.

The first layer is the request itself. A user asks for an outcome: 2 GB/s, seven days, three zones. The platform translates it into provider vocabulary. On AWS that's 50 `m7i.2xlarge` brokers, `gp3` volumes and S3 tiering; on Google Cloud `n2-standard-8`, `pd-balanced` and Cloud Storage; on Azure `Standard_D8s_v5` and Premium SSD v2; on Oracle Cloud flexible E5 shapes and balanced block volumes.  Underneath come JVM settings, partition placement across zones, rack awareness for fetch-from-follower, and operator configuration. The same intent produced the per-cloud figures above.

Kubernetes gives that translation a common place to execute. Operators such as Strimzi supply reconciliation and a portable control surface, but storage classes, load balancers, IAM, DNS, certificates and upgrade mechanics still differ by provider, and air-gapped and edge environments make every difference explicit. A meta-operator above the distribution operators turns desired state into provider-aware custom resources and leaves each distribution's own operator to reconcile them, so the platform owns the translation and the upstream operators keep owning their systems.

## Operating the estate

Creating a cluster is the easy operation. Scaling, rolling configuration and certificates, upgrading Kafka and its operators, and recovering are where estates spend their people, and each is a long-running, ordered operation that has to survive its own controller failing. A rolling upgrade of the 50-broker cluster above restarts brokers one at a time and waits at each step for leadership to move back and the in-sync replica sets to fill. At an assumed five minutes a broker, that's more than four hours, and the operation has to survive the controller running it being restarted or rescheduled along the way.  The ZooKeeper-to-KRaft migration every ZooKeeper-based estate faces is exactly this kind of operation, only longer.

So lifecycle operations run as durable workflows with explicit state: retries, checkpoints after every step, health gates between steps, and pause and resume points, with an audit record of each. Every create, update and delete returns an operation ID, and a durable executor, of the kind Temporal provides, runs it to completion, retrying through failures and restarts and recording every resource it creates. One API contract sits in front of it, and the console, CLI, Terraform provider and MCP server are all clients of that contract, so no interface can do something the others can't audit.

The other half of operations is reaching the clusters at all. A management plane needs to read metrics and logs and hand work to clusters that sit behind firewalls and NAT, without opening them to the internet. The pattern that works is one agent per fleet that receives work from the management plane over a private connection and reports back the same way, without ever calling the management API itself, so fleets can sit behind firewalls with nothing open inbound. A WireGuard mesh carries that connection: Tailscale, or a self-hosted Headscale coordinator where coordination must be inside the boundary too, with DERP relays carrying encrypted traffic when peers can't connect directly. Application traffic to Kafka never uses it.

Air-gapping is then a question of placement. Connected and BYOC estates use a hosted management plane over the private mesh. Restricted-egress estates add mirrors and policy-controlled egress. A true air-gap moves the management plane inside the boundary along with every dependency it needs: images and a local registry, identity, models, management services. The APIs, operators and workflows stay the same, which means the management plane has to be small enough to run from a single container in a pilot and highly available on a cluster in production.

That leaves the people term, and agents are where it shrinks. An agent pointed at arbitrary infrastructure does badly today: in IBM's ITBench, agents on state-of-the-art models resolved 13.8% of site-reliability scenarios.[^itbench]  An agent operating one vertical platform works on a much smaller problem. The platform exposes a fixed set of management operations for a known stack, and each operation can carry a contract.

The contract matters because management semantics are mostly unwritten. Wang and colleagues at HotNets '26 propose formal operations specifications: every management interface $$m$$ is written as a Hoare triple $$\{P\}\,m\,\{Q\}$$, so that if precondition $$P$$ holds before the call, $$m$$ runs safely and leaves postcondition $$Q$$.[^fos]  Their running example is PostgreSQL failover, which has three preconditions that the operator's developers found only after failures, none of them in the manual. A field study they cite puts erroneous interactions with the managed system at 42% of operator failures. Checking four Kubernetes operators against such specifications, they found 39 new bugs, five of them in Strimzi, where they modelled 46 interfaces. For agents, they propose checking each proposed action against the specification at run time.

That check has a natural home in the architecture above. The agent proposes, the contract checks the precondition, the durable executor acts, and the health gate verifies the postcondition, with every step recorded. The agent works through the same API as people, with the desired state, actual state, recent changes and in-flight operations as context, and it acts only through guarded actions.

The model shows where that's worth something. Agents that take over most of the platform team's share are the $$\kappa = 0.25$$ column above. The expert tribe and the hedge stay, because the incident nobody has seen before still needs a person who has. Twenty ten-broker clusters then need 3.8 engineers instead of 7.4, against 2 for a managed service, and the crossover at list on AWS falls from 8 MB/s to 1.  That's a scenario, and the contracts have to exist before it's real. What vertical, contract-checked operations buy is a team that stays small as the estate grows, with humans on the gate for any operation that doesn't have a contract yet.

* * *

## When to self-host, and when not

Put together, the platform is four layers, each replaceable at its boundary:

- **A self-service contract:** tenancy, policy, a fleet view and agents.
- **A durable operations API:** the meta-operator and provider-aware custom resources.
- **The real-time stack:** Kafka in its upstream, commercial, diskless and edge forms, Kafka Connect and Flink, with ClickHouse, Iceberg and Hudi for analytics, under one identity and operations model.
- **Your substrate:** your Kubernetes, cloud accounts or data centre, your PKI, identity provider, registry, licences and models.

The strongest case against all of this is what the model leaves out. A managed service carries upgrades, patching, compliance attestations and the outage at 3 a.m.; the model's platform share and hedge are what replace them. A platform team that's already stretched, or loses the people who knew Kafka, costs more than the model says, and a team that has never run Kafka pays a learning cost the model prices at zero. Negotiated discounts move every column, which is why the number to take into a renewal is the break-even discount. All of it pushes the crossover up. None of it changes the shape: a people cost that grows slowly with the estate against fees that grow with every byte and every managed boundary it crosses.

Self-host when:

- **You already do.** Upstream Kafka, Strimzi, Cloudera and Confluent Platform teams have the expertise a migration is supposed to save; spend the effort on the levers and the KRaft migration instead of a move.
- **Throughput per cluster is above a few tens of MB/s** against a multi-cloud managed service, unless the discount on the table beats the break-even for your cloud. On Azure and Oracle Cloud it rarely can.
- **You run Flink, Kafka Streams or ClickHouse beside Kafka.** Price the whole stack; the per-GB fees repeat at every managed hop.
- **You're on metal, in a regulated estate or behind an air-gap.** Self-host with concentrated expertise, and keep the control plane and its dependencies inside the boundary too; BYOC isn't enough.
- **You're on MSK Serverless or Express beyond a few tens of MB/s.** Self-hosting wins on cost alone, by half or more at scale.
- **You pay for Confluent Platform or Cloudera mostly to get tiered storage.** Upstream Kafka has it. The licence adds 13 to 20% to a self-run AWS bill and roughly doubles one on Azure, Oracle Cloud or a long-tail cloud.
- **Your data can live on a regional or long-tail cloud.** DigitalOcean, Akamai, Hetzner and OVHcloud charge nothing for private traffic within a site and sell brokers for less. Check capacity, and either accept one site or pay to stretch across two.
- **You want the exit to stay cheap.** Against MSK Standard, BYOC or lakehouse-native Kafka, self-hosting is a modest cost hedge and a real lock-in hedge.

Don't, or not yet, when:

- **You have one or two small clusters, no platform team to absorb them, and no rule about who operates the system.** Buy managed, and on AWS look hard at MSK.
- **Your workload can't take the latency the levers add** and replicated brokers on AWS are your only option: MSK Standard will beat you there.
- **Nobody on staff or on retainer knows Kafka deeply.** Fix that first. The expert tribe is the one cost every option shares.

We run self-hosted Kafka and Flink for customers as a managed service, sell Kafka support per production cluster and build [Streamtime](https://streamtime.ai/), a private cloud for streaming, so we have a stake in where the line sits.

[^current]: [Current 2026 San Francisco: Towards a sovereign streaming cloud](https://current.confluent.io/san-francisco/sessions#session-SESS-185), lightning talk, 5 November 2026.
[^ccloud]: [Confluent Cloud pricing](https://www.confluent.io/confluent-cloud/pricing/), list prices, read November 2026; ranges vary by cloud and region.
[^aws-xaz]: AWS EC2 data transfer pricing; corroborated in [Why your Kafka bill is mostly network](https://dev.to/devopsdaily/why-your-kafka-bill-is-mostly-network-30a3).
[^gcp-net]: [Google Cloud: all networking pricing](https://cloud.google.com/vpc/network-pricing).
[^azure-az]: [Microsoft removes egress fees for moving data between availability zones](https://www.datacenterdynamics.com/en/news/microsoft-removes-egress-fees-for-moving-data-between-availability-zones-in-same-azure-cloud-region/), DCD; [Azure bandwidth pricing](https://azure.microsoft.com/en-us/pricing/details/bandwidth/).
[^oci-net]: [Oracle Cloud Infrastructure: virtual cloud network pricing](https://www.oracle.com/cloud/networking/virtual-cloud-network/pricing/).
[^vm]: On-demand list prices, US regions: m7i.2xlarge $0.4032/hour, n2-standard-8 $0.3885, Standard_D8s_v5 $0.384, OCI E5 Flex with 4 OCPUs and 32 GB about $0.24 ([Oracle IaaS prices](https://www.oracle.com/cloud/iaas-paas/), [Vantage](https://instances.vantage.sh/aws/ec2/m7i.2xlarge), [gcloud-compute](https://gcloud-compute.com/n2-standard-8.html)). Disks: gp3 $0.08, pd-balanced $0.10, Premium SSD v2 $0.081 and OCI balanced block volumes about $0.0425 per GB-month, with 50% headroom. Brokers at 40 MB/s each follows a common sizing of 5 MiB/s of produce and 15 MiB/s of consume per vCPU ([AKalculator assumptions](https://2minutestreaming.com/tools/apache-kafka-calculator/resources/assumptions/produce-consume-per-vcpu), Stanislav Kozlovski, December 2024), and sits below the 62.5 MB/s of sustained ingress AWS quotes for an 8-vCPU MSK Express broker, which keeps its storage off the broker ([Amazon MSK quotas](https://docs.aws.amazon.com/msk/latest/developerguide/limits.html)). Labour is $130,000 per fully loaded engineer-year.
[^msk]: [Amazon MSK pricing](https://aws.amazon.com/msk/pricing/): "You are not charged for data transfer used for replication between brokers"; tiered storage $0.06 per GB-month. Broker price from the AWS price list for US East: `kafka.m7g.2xlarge` $0.816 per hour.
[^msk-shapes]: [Amazon MSK pricing](https://aws.amazon.com/msk/pricing/) and the AWS price list for US East, November 2026: Standard `kafka.m7g.2xlarge` $0.816 per hour, broker storage $0.10 and tiered $0.06 per GB-month, tiered retrieval $0.0015 per GB; Express `express.m8g.large` $0.3468 per hour, scaling linearly by size, $0.01 per GB written, $0.10 per GB-month; Serverless as stated. Throughput from [Amazon MSK quotas](https://docs.aws.amazon.com/msk/latest/developerguide/limits.html): Express sustained 15.6 MB/s in and 31.2 MB/s out per `large`, Serverless 200 MB/s in and 400 MB/s out per cluster. The model assumes fetch-from-follower on Express, partitions at 2.5 MB/s for Serverless and 5% of reads from tiered storage.
[^diskless]: [Diskless Kafka: KIP-1150 and Kafka's future](https://softwaremill.com/diskless-kafka-object-storage-kip-1150-and-kafkas-future/), SoftwareMill. The model assumes 4 MB objects at $0.005 per 1,000 writes and every consumer read served from object storage at $0.0004 per 1,000 4 MB reads, with no cache hits ([Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)).
[^kafka39]: [Apache Kafka 3.9.0 release announcement](https://kafka.apache.org/blog/2024/11/06/apache-kafka-3.9.0-release-announcement/), November 2024.
[^kafka40]: [Apache Kafka 4.0.0 release announcement](https://kafka.apache.org/blog/2025/03/18/apache-kafka-4.0.0-release-announcement/), March 2025; [Kafka upgrade notes](https://kafka.apache.org/41/getting-started/upgrade/).
[^strimzi]: [Strimzi joins the CNCF incubator](https://www.cncf.io/blog/2024/02/08/strimzi-joins-the-cncf-incubator/), CNCF, February 2024.
[^cloudera]: [Streams Messaging](https://docs.cloudera.com/cdp-private-cloud-base/7.3.3/howto-streaming.html) and [What's new in Streams Messaging, 7.3.2](https://docs.cloudera.com/cdf-datahub/7.3.2/release-notes/topics/cdf-datahub-whats-new-streams-messaging.html), Cloudera documentation.
[^cp-license]: [Manage Confluent Platform licenses](https://docs.confluent.io/platform/current/installation/license.html), Confluent documentation.
[^lakehouse]: [Tableflow is generally available](https://confluent.io/blog/tableflow-is-now-generally-available), Confluent; [Amazon MSK Express brokers deliver data to streaming tables for Apache Iceberg](https://aws.amazon.com/about-aws/whats-new/2026/07/aws-msk-streaming-tables-for-apache-iceberg), AWS, July 2026; [Iceberg Topics for Apache Kafka](https://aiven.io/blog/iceberg-topics-for-apache-kafka-zero-etl-zero-copy), Aiven.
[^byoc]: For example [Redpanda on BYOC and sovereignty](https://redpanda.com/blog/data-sovereignty-fully-managed-cloud-byoc) and [StreamNative BYOC](https://streamnative.io/cloud/byoc).
[^ibm]: [Data streaming landscape Q3 2026](https://www.kai-waehner.de/landscapes/data-streaming-landscape-q3-2026/), Kai Waehner; Confluent describes itself as "an IBM company" in its [Streamhouse announcement](https://newsroom.ibm.com/2026-11-04-confluent-introduces-its-streamhouse-architecture-to-power-ai-with-real-time-business-context).
[^kozlovski]: Stanislav Kozlovski, [The brutal truth about Apache Kafka cost calculators](https://bigdata.2minutestreaming.com/p/the-brutal-truth-about-apache-kafka-cost-calculators), December 2024, November 2024 prices; his calculator is [AKalculator](https://2minutestreaming.com/apache-kafka-calculator).
[^msf]: [Amazon Managed Service for Apache Flink pricing](https://aws.amazon.com/managed-service-apache-flink/pricing/), US East.
[^clickhouse]: [ClickHouse Cloud pricing](https://clickhouse.com/pricing), Scale tier, AWS US East; ClickPipes also charges $0.20 per compute unit-hour.
[^ccloud-net]: [Confluent Cloud networking overview](https://docs.confluent.io/cloud/current/networking/overview.html), comparison of peering, PrivateLink, Transit Gateway and Private Network Interface; [Confluent Cloud billing dimensions](https://docs.confluent.io/cloud/current/billing/dimensions/overview.html) list no private-networking charge.
[^privatelink]: [AWS PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/): $0.01 per endpoint per AZ-hour, data processing $0.01 per GB for the first PB, $0.006 for the next 4 PB, $0.004 above; [AWS Transit Gateway pricing](https://aws.amazon.com/transit-gateway/pricing/): $0.05 per attachment-hour and $0.02 per GB processed, billed to the sender; [Amazon MSK pricing](https://aws.amazon.com/msk/pricing/): multi-VPC private connectivity $0.006 per GB processed.
[^itbench]: Jha et al., [ITBench: Evaluating AI agents across diverse real-world IT automation tasks](https://arxiv.org/abs/2502.05352), ICML 2025.
[^fos]: Jinlang Wang, Jiawei Tyler Gu, Ruize Tang, Tej Chajed, Tianyin Xu and Xudong Sun, [Formal operations specifications for reliable system management](https://djapg7v42ea9q.cloudfront.net/pdf/hotnets26-final281.pdf), HotNets '26, [doi:10.1145/3847290.3859962](https://doi.org/10.1145/3847290.3859962).
[^licences]: Confluent price list on the UK [G-Cloud 15 framework](https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-15/documents/584424/568514552357476-pricing-document-2026-01-29-1502.pdf), January 2026: Confluent Platform standard node, Gold $12,000 and Platinum $15,000 per year in production, a node being up to 56 cores, 24 drives, 50 TB and 256 GB of RAM; Cloudera's [pricing page, May 2024](https://web.archive.org/web/20240527222511/https://www.cloudera.com/products/pricing.html): Cloudera Base at $10,000 per node plus $100 per CCU and $25 to $100 per TB; [Redpanda licensing](https://docs.redpanda.com/current/get-started/licensing/). List prices; negotiated prices differ.
[^longtail]: [DigitalOcean pricing docs](https://docs.digitalocean.com/products/droplets/details/pricing/) for Droplets, Volumes, Spaces, VPC and Managed Kafka; [Akamai Cloud API](https://api.linode.com/v4/linode/types) instance, block and object storage prices; [Hetzner Cloud](https://www.hetzner.com/cloud/general-purpose) CCX33 and object storage, volumes at €0.0572 per GB-month, converted at $1.15 per euro; [OVHcloud multi-AZ](https://www.ovhcloud.com/asia/about-us/global-infrastructure/multi-az/).

<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js"></script>

