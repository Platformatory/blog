---
layout: post
title: "Comparison of Kafka Deployment Options on Kubernetes"
authors: raghav
categories: [Platform Engineering, Infrastructure, Kafka, Kubernetes]
image: assets/blog-images/kafka_on_kubernetes/kafka_on_kubernetes.png
featured: false
hidden: false
teaser: Comparison of Kafka Deployment Options on Kubernetes
toc: true
---

# Introduction
Organizations that run their business applications on Kubernetes expect the same from Kafka and plan to work through the design and deployment of Kafka to run along with their applications. This post goes into the internals of the challenges in doing so, the options to overcome them by building on the options that many companies are using to achieve the outcome.

# Overall Structure
This blogpost gently introduces the various systems that need to be tied together, lists out a few internals that are key in making them work together and finally lists out the options that are widely available to run Kafka on Kubernetes.

# What is a Container?
Containers allow us to build an application once and run it anywhere with a compatible container engine. The most popular container engines are: Docker (released in 2013), containerd, CRI-O, Podman, rkt (Rocket), and LXC/LXD (Linux Containers) with LXD being the system container manager. Containers are isolated from one another and contain their own software, libraries and configuration files. They share the services of the Operating System they are running on and therefore use fewer resources when compared to virtual machines. A microservice (typically stateless so that they can be easily added/removed) can be modeled as a set of containers running together behind a load balancer to serve a specific purpose (like order management). Software that is not natively built for to be run in a container can be containerized (like Kafka).

# Brief introduction to Kubernetes
Kubernetes (or K8S) is an open source orchestrator for deploying containerized applications. It was originally developed by Google, inspired from their experience of deploying scalable, reliable systems in containers via application-oriented APIs. Since its introduction in 2014, Kubernetes has grown to be one of the largest and most popular open source projects in the world. It has become the standard API for building cloud native applications, present in nearly every public cloud.

Kubernetes was built to be extensible which gives people the ability to augment the clusters, develop extensions and to build new patterns of managing systems like the Operator pattern.

# Brief introduction to Kafka and some Key Characteristics
Apache Kafka (released in 2011) is a distributed commit log that helps customers to build a backbone for data that is high throughput and provides low latency. It consists of multiple brokers (or nodes) responsible for one/more partitions of a Topic (a construct which is used by publishers to send messages to and for consumers to read messages from). Zookeeper (deprecated in version Kafka 3.5 and removed in Kafka 4.0 and replaced by KRaft) was responsible for leader elections, membership, service state, configuration data, ACLs and quotas. It comes with an ecosystem consisting of:
- Kafka Connect that provides components to bring data from outside Kafka (like databases) and to send data to outside Kafka (e.g., another database or a data store), 
- Kafka Streams to develop streaming applications. 
- Schema Registry that helps define and enforce schema for the messages that are published and consumed to/from a Kafka Topic.

Here's the architecture diagram:
<div id="kafka" class="mermaid">
flowchart TD

 subgraph PRODUCERS["Producers"]
        P1("Producer 1")
        P2("Producer 2")
        P3("Producer 3")
  end
 subgraph CG1["Consumer Group 1"]
        C1("Consumer 1")
  end
 subgraph CG2["Consumer Group 2"]
        C2("Consumer 1")
        C3("Consumer 2")
  end
 subgraph CG3["Consumer Group 3"]
        C4("Consumer 1")
        C5("Consumer 2")
  end
 
 subgraph K1["Kafka Cluster"]
        B1["Broker 1"]
        B2["Broker 2"]
        B3["Broker 3"]
  end
subgraph Z1["Zookeeper Cluster"]
    direction TB
        ZK1["Zookeeper Node 1"]
        ZK2["Zookeeper Node 2"]
        ZK3["Zookeeper Node 3"]
  end


    ZK1 <--> B1
    ZK2 <--> B1
    ZK3 <--> B1
    
    ZK1 <--> B2
    ZK2 <--> B2
    ZK3 <--> B2
    
    ZK1 <--> B3
    ZK2 <--> B3
    ZK3 <--> B3
    
    ZK1 <--> ZK2 <--> ZK3

    P1 -- Produces ---> B1
    P2 -- Produces ---> B2
    P3 -- Produces ---> B3
    
    B1 -- Consumes --> CG1
    
    B2 -- Consumes --> C2
    B3 -- Consumes --> C3

    B2 -- Consumes --> C5
    B3 -- Consumes --> C4


    %% Styling
    classDef kafkaStyle fill:#e0f7e9,stroke:#4caf50,stroke-width:2px;
    class K1,K2 kafkaStyle;
</div>

Apart from what we said above, Kafka is:
- A stateful service which means that bringing down a broker (the node that is responsible for one or more partitions of a topic) has an impact on the availability of the topic and the producers and consumers connected to the partitions owned by the broker.
- Made up of brokers (we need to have at least three) where each broker knows the existence of other brokers (unlike a microservice).
- Made up of producers/consumers that connect directly to one or more brokers which means that putting a load balancer in front of a broker isn’t meaningful.
- Each broker maintains a cache of the messages in the filesystem cache which cannot be reserved and will be made available by the OS depending on the amount of space after being shared with other processes. An alternative to Kafka is Redpanda which reserves memory and uses the Direct Memory Access (DMA) capability to service the reads and writes and bypasses the filesystem cache.

Zookeeper has similar characteristics:
- A stateful service where data is stored in a hierarchical namespace like a filesystem or a tree data structure.
- Made up of nodes (at least three and an odd number of nodes) to maintain quorum.
- Each node knows the existence of other nodes.
- Each client (Kafka broker) knows about the existence of nodes and has a direct connection to the nodes.

# Typical Requirements of running Kafka
## Security
- Auto generate certificates for TLS and mTLS between brokers and other internal components
- Natively support authentication mechanism such as SASL/PLAIN, SASL/SCRAM, SASL/OAUTHBEARER, SASL/GSSAPI
- Authorization with ACLs - Provide user management capabilities using the k8s API

## Operations
- Re-balancing partitions when the load on the brokers is uneven, broker is added/removed
- Monitoring cluster health with JMX metrics
- Rolling upgrades with no downtime
- Replicate data across clusters
- Rack awareness for durability


# Key Concerns of Running Kafka in Kubernetes
As we saw in the timeline (Zookeeper 3.0 released in 2008, Kafka released in 2011, Docker in 2013 and Kubernetes in 2014), Kafka (and in turn Zookeeper) predate native container based applications. So, they fall into the category of applications that are containerized although they were not designed to be run in containers. Also, we need to make them Stateful, have the producers/consumers know the existence of brokers, have the ability for each broker to connect to others, and be able to recover back after a pod goes down (a pod in Kubernetes consists of one/more containers that work together to offer a set of features. One design option is to containerize Kafka/Zookeeper and build each one into a pod which can then be handled by Kubernetes).

## How do we model the Kafka/Zookeeper Resources?
Kubernetes provides support for CustomResourceDefinition which can be used to model a cluster, Connect/Connector, Mirror Maker (to replicate records across Kafka clusters), Kafka Users, Topics, Prometheus Metric, and Security (TLS, SCRAM, Keycloak). This is how Strimzi models all Kafka/Zookeeper resources.

## How do we model the infrastructure?
*** StatefulSet*** : a StatefulSet is a Kubernetes resource designed for stateful applications. So, we model both Kafka/Zookeeper as a StatefulSet which guarantees:
- Stable, unique names and network identifiers
- Stable persistent storage that moves with the pod (even when it moves to a different node)
- Pods are created sequentially (1, 2, 3, … n) and terminated in the opposite order (n, n-1, …, 3, 2, 1)
- Rolling updates are applied in the termination order
- All successors of a pod should be terminated before the pod itself is terminated

A StatefulSet requires a *** headless service *** to control the domain of the pods. A normal service presents an IP address and load balances the pods behind it, but a headless service returns the IP addresses of all its pods in response to a DNS query. Due to this, Kubernetes allows DNS queries for the pod name as part of the service domain name.

An interesting question arises about how a producer/consumer outside of the Kubernetes cluster gets access to the pods (Kafka Brokers). In case they are all within the same network, connectivity works seamlessly. If not, then there is a need to implement a Container Network Interface (CNI) which is part of the plumbing offered by Kubernetes to create an application (along with Container Runtime Interface or CRI and Container Storage Interface or CSI).

Some downsides to using a StatefulSet:
- Broker configuration cannot be modified, unless specific override mechanisms are implemented (e.g., initContainers)
- Cannot remove a specific broker because it allows the removal of most recently added broker (based on the termination order in a StatefulSet)
- Cannot use different persistent volumes for each broker

***Strimzi*** and ***KOperator*** (which are deployment options listed below) do not go the route of StatefulSet (but ***CFK*** does) and therefore do not need the headless service. 

Kubernetes has an interesting pattern called the Operator. Any complex stateful workload (like Kafka) that can’t be run as a fully managed service will be provided as a Kubernetes operator. This allows us to proactively manage custom resources (created via the CustomResourceDefinitions). Operators are very powerful and they enable users to get custom abstractions that are responsible for deployment, health check and repair of the custom resources (e.g., Kafka Cluster, Topic).

Another interesting thing to note is that Confluent uses Kubernetes to implement Kora which is their cloud native streaming platform for Kafka. Read more about it here. Also, Confluent brought this experience to their CFK offering.

## Scope of coverage: A mental model on Kubernetes Operators for Kafka
What are the important requirements from an Operator to successfully run Kafka on Kubernetes? We list them here:
- Operator Core
  - Custom Resources
  - Workload Type
  - Networking
  - Storage
- Security
  - Authentication
  - Authorization
- Operational Features
  - Balancing
  - Monitoring
  - Disaster Recovery
  - Scale up/out
  - Deployments & Rollouts
- Extensibility

# Deployment Options
## Strimzi
Strimzi is an open-source project designed to run Apache Kafka on Kubernetes. It simplifies the deployment, management, and monitoring of Kafka clusters.
Features:
- Automated deployment and scaling of Kafka clusters.
- Integrated Zookeeper management.
- Custom resource definitions (CRDs) for Kafka, Kafka Connect, Kafka MirrorMaker, and Kafka Bridge.
- Configuration of Kafka resources (e.g., Kafka cluster - Storage, Listeners, Rack awareness)
- Rolling updates and upgrades.
- Monitoring and logging with Prometheus and Grafana.
- Implement security  in a Kubernetes-native fashion
- Uses StrimziPodSets to overcome challenges of StatefulSets
  - Add/remove broker arbitrarily
  - Stretch cluster across k8s clusters
  - Different configurations and volumes for different brokers
- KafkaBridge for a RESTful HTTP interface
- Security: FIPS mode auto-enablement when using Strimzi container images

Here's the architecture diagram:
<div class="mermaid">
flowchart LR

subgraph PRODUCERS["Producers"]
    subgraph PP1P1["Pod 4"]
        P1("Producer 1")
     end  
    subgraph PP2P2["Pod 5"]
        P2("Producer 2")
     end
    subgraph PP3P3["Pod 6"]
        P3("Producer 3")
     end 
  end

 subgraph CG1["Consumer Group 1"]
    subgraph CP1C1["Pod 7"]
        C1("Consumer 1")
     end 
        
  end
 subgraph CG2["Consumer Group 2"]
    subgraph CGP1C1["Pod 8"]
        C2("Consumer 1")
     end
    subgraph CGP1C2["Pod 9"]
        C3("Consumer 2")
      end
  end
 subgraph CG3["Consumer Group 3"]
    subgraph CGP3C1["Pod 10"]
        C4("Consumer 1")
     end
    subgraph CGP3C2["Pod 11"]
        C5("Consumer 2")
      end
  end

subgraph CONSUMERS["Consumers"]
    CG1
    CG2
    CG3
 end

subgraph CLS["Clients"]
    PRODUCERS
    CONSUMERS
end
 
 subgraph K1["Kafka Cluster"]
    subgraph P1B1["Pod 1"]
        B1["Broker 1"]
    end   
    subgraph P2B2["Pod 2"]
        B2["Broker 2"]
    end
    subgraph P3B3["Pod 3"]
        B3["Broker 3"]
    end
  end

subgraph EO["Entity Operator"]
    UO["User Operator"]
    TO["Topic Operator"]
 end

 subgraph KCO[" "]
    K1
    EO
  end

subgraph SZ["Strimzi"]
    KCO
    TCR
    CO
    KCR
    UCR
 end
subgraph KC["Kubernetes Cluster"]
    SZ
    CLS
 end


P1 -- Produces ---> B1
P2 -- Produces ---> B2
P3 -- Produces ---> B3
    
B1 -- Consumes --> CG1
B2 -- Consumes --> C2
B3 -- Consumes --> C3

B2 -- Consumes --> C5
B3 -- Consumes --> C4

KCO <-- Deploys & Manages --> CO["Cluster Operator"] <--> KCR["Kafka Custom Resources"]
TO <--> TCR["Topic Custom Resources"]
UO <--> UCR["User Custom Resources"]
    
TO -- Manages Topics --> K1
UO -- Manages Users --> K1

%% Styling
    classDef kafkaStyle fill:#e0f7e9,stroke:#4caf50,stroke-width:2px;
    class K1,K2 kafkaStyle;
    classDef default font-size:16px;
</div>

## Confluent for Kubernetes (CFK)
Confluent for Kubernetes is a Confluent-supported operator for deploying and managing Confluent Platform components, including Kafka, on Kubernetes. This was developed based on Confluent's experience of developing Confluent Cloud using Kubernetes. Please refer to the [Kora engine paper](https://www.vldb.org/pvldb/vol16/p3822-povzner.pdf) for more details.

Features:
- Automated deployment and scaling of Confluent Platform components.
- Advanced security configurations, including TLS, Kerberos, and OAuth.
- Integration with Confluent Control Center for monitoring and management.
- Uses StatefulSets for restoring a Kafka pod with the same Kafka broker ID, configuration, and persistent storage volumes if a failure occurs.
- Provides server properties, JVM, and Log4j configuration overrides for customization of all Confluent Platform components.
- Complete granular RBAC
- Support for credential management systems, via CredentialStoreConfig CR, to inject sensitive configurations in memory to Confluent deployments
- Supports tiered storage
- Supports multi-region

Here's the architecture diagram:
<div class="mermaid">
flowchart TB

    subgraph PRODUCERS["Producers"]
        subgraph PP1P1["Pod 4"]
            P1("Producer 1")
        end
        subgraph PP2P2["Pod 5"]
            P2("Producer 2")
        end
        subgraph PP3P3["Pod 6"]
            P3("Producer 3")
        end
    end

    subgraph CONSUMERS["Consumers"]
        subgraph CG1["Consumer Group 1"]
            subgraph CP1C1["Pod 7"]
                C1("Consumer 1")
            end
            subgraph CGP1C1["Pod 8"]
                C2("Consumer 1")
            end
            subgraph CGP1C2["Pod 9"]
                C3("Consumer 2")
            end
        end
    end

    subgraph CLS["Clients"]
        PRODUCERS
        CONSUMERS
    end

    subgraph K1["Kafka Cluster"]
        direction LR
        subgraph P1B1["Pod B1"]
            B1["Broker 1"]
        end
        subgraph P2B2["Pod B2"]
            B2["Broker 2"]
        end
        subgraph P3B3["Pod B3"]
            B3["Broker 3"]
        end
    end

    subgraph ZK1["Zookeeper Cluster"]
        subgraph P1Z1["Pod 1"]
            Z1["Node 1"]
        end
        subgraph P2Z2["Pod 2"]
            Z2["Node 2"]
        end
        subgraph P3Z3["Pod 3"]
            Z3["Node 3"]
        end
    end

    subgraph CC1["Connect Cluster"]
        subgraph P1C1["Pod 1"]
            CW1["Node 1"]
        end
        subgraph P2C2["Pod 2"]
            CW2["Node 2"]
        end
        subgraph P3C3["Pod 3"]
            CW3["Node 3"]
        end
    end

    subgraph SR1["Schema Registry"]
        subgraph P1SR1["Pod 1"]
            SRN1["Node 1"]
        end
        subgraph P2SR2["Pod 2"]
            SRN2["Node 2"]
        end
    end

    subgraph R1["Replicator"]
        subgraph P1REP1["Pod 1"]
            REP1["Replicator 1"]
        end
        subgraph P2REP2["Pod 2"]
            REP2["Replicator 2"]
        end
    end

    subgraph COCP["Control Center Pod"]
        COCE["Control Center"]
    end

    subgraph O["Operator Pod"]
        OP1["Operator"]
    end

    subgraph KR["Kafka Resources"]
        K1
        ZK1
        CC1
        COCP
        SR1
        R1
    end

    subgraph KC["Kubernetes Cluster"]
        O
        KR
        CLS
    end

    subgraph PSV["Persistent Storage Volumes"]
        AEBS["Amazon EBS"]
        GCPS["GCP Storage"]
        AD["Azure Disks"]
        RS["Remote Storage"]
    end

    subgraph RP["Resource Provider (AWS, GCP, Azure, OpenShift)"]
        KC
        PSV
    end

    %% Connections
    P1 --|Produces|--> B1
    P2 --|Produces|--> B2
    P3 --|Produces|--> B3

    B1 --|Consumes|--> C1
    B2 --|Consumes|--> C2
    B3 --|Consumes|--> C3

    O --|Manages|--> KR

    KR -->|Uses| AEBS
    KR -->|Uses| GCPS
    KR -->|Uses| AD
    KR -->|Uses| RS

    %% Styling
    classDef kafkaStyle fill:#e0f7e9,stroke:#4caf50,stroke-width:2px;
    class K1,K2 kafkaStyle;
    classDef default font-size:16px;
</div>

## KOperator (formerly Banzai Cloud Kafka Operator)
KOperator, developed by Banzai Cloud (now part of Cisco), provides a robust and scalable solution for running Kafka on Kubernetes.
Features:
- Uses pods instead of StatefulSets, in order to
  - ConfigMaps: modify the configuration of unique Brokers. Rack awareness.
  - Storage: use multiple Persistent Volumes for each Broker
- Envoy based load balancing for external access
- CruiseControl for scaling up/down, rebalance
  - Orchestration: remove specific Brokers from clusters
  - Self-healing and automated recovery.
- Integrated Zookeeper management.
- Monitoring with Prometheus and Grafana.
- Multi-cluster support and cross-cluster replication.

Here's the architecture diagram:
<div class="mermaid">
flowchart TD

 subgraph PRODUCERS["Producers"]
    subgraph PP1P1["Pod 4"]
        P1("Producer 1")
     end  
    subgraph PP2P2["Pod 5"]
        P2("Producer 2")
     end
    subgraph PP3P3["Pod 6"]
        P3("Producer 3")
     end 
  end

 subgraph CG1["Consumer Group 1"]
    subgraph CP1C1["Pod 7"]
        C1("Consumer 1")
     end 
        
  end
 subgraph CG2["Consumer Group 2"]
    subgraph CGP1C1["Pod 8"]
        C2("Consumer 1")
     end
    subgraph CGP1C2["Pod 9"]
        C3("Consumer 2")
      end
  end
 subgraph CG3["Consumer Group 3"]
    subgraph CGP3C1["Pod 10"]
        C4("Consumer 1")
     end
    subgraph CGP3C2["Pod 11"]
        C5("Consumer 2")
      end
  end

subgraph CONSUMERS["Consumers"]
    CG1
    CG2
    CG3
 end

subgraph CLS["Clients"]
    PRODUCERS
    CONSUMERS
end
 
 subgraph K1["Kafka Cluster"]
    subgraph P1B1["Pod 1"]
        B1["Broker 1"]
    end   
    subgraph P2B2["Pod 2"]
        B2["Broker 2"]
    end
    subgraph P3B3["Pod 3"]
        B3["Broker 3"]
    end
  end

subgraph CC["Cruise Control"]
 end

subgraph KAS["Kubernetes API Server"]
 end

subgraph PS["Prometheus"]
    A["Alerts"]
 end
subgraph KO["KOperator"]
    AM["Alert Manager"]
 end

subgraph KC["Kubernetes Cluster"]
 KO
 KAS
 CC
 CLS
 K1
 PS
 G
 end

    CC <--> B1
    CC <--> B2
    CC <--> B3

    P1 -- Produces ---> B1
    P2 -- Produces ---> B2
    P3 -- Produces ---> B3
    
    B1 -- Consumes --> CG1
    
    B2 -- Consumes --> C2
    B3 -- Consumes --> C3

    B2 -- Consumes --> C5
    B3 -- Consumes --> C4

    KAS --> P1B1
    KAS --> P2B2
    KAS --> P3B3
    
    A --> AM
    PS --> G["Grafana"]
    P1B1 --> PS
    P2B2 --> PS
    P3B3 --> PS

    KO <--> KAS
    KO --> CC

    %% Styling
    classDef kafkaStyle fill:#e0f7e9,stroke:#4caf50,stroke-width:2px;
    class K1,K2 kafkaStyle;
    classDef default font-size:16px;
</div>

# Redpanda Operator
The Redpanda Kubernetes operator simplifies the deployment and management of Redpanda clusters on Kubernetes. The Redpanda version of Kafka does not use filesystem cache and instead uses Direct Memory Access (DMA) which helps it reserve memory directly and use it for quickly building the cache (helpful when a pod goes down and comes back).

Features:
- Automated Cluster Management: Simplifies deployment, scaling, and management of Redpanda clusters.
- Performance Optimization: Tuned for high performance and low latency.
- Self-healing: Automatically handles node failures and ensures high availability.
- Monitoring: Redpanda integrates with Prometheus and Grafana for monitoring. You can deploy Prometheus and Grafana in your Kubernetes cluster and configure them to scrape Redpanda metrics.
- TLS and Authentication: For production deployments, it is recommended to enable TLS and configure authentication for secure communication between clients and the Redpanda cluster.


# Prescriptive Advise
- As with all things, k8s: It is important to setup resource constraints (CPU, MemLimits)
- Generally advised to have Kafka nodes tainted to NoSchedule and run on a dedicated basis. 
  - = no binpack nodes
- For most real-life use-cases, CRs are a starting point. Will need to be use packaged “platform recipes” with different components, orienting some level of tenancy around the brokers as well as the components
  - Typically a higher order Helm chart, preferably with GitOps style deployments
  - Prospective users must also think about operator tenancy itself. Could be a global operator or a namespaced operator
Key Takeaways
- Running Kafka on K8S can be a lot of toil, without an operator. If you are running Kafka at scale (and not on a managed service), consider running one. It will save you time, money & sanity
  - You can make a choice based on your environment, features (or the lack thereof), licensing and  other specialized purposes
- YMMV with Operator CRs. Each operator has its own opinion based on the realities it was designed for
  - Kafka is ultimately not “k8s native”. The operator only provides so much operational sugar
  - As a result, there are several shoehorning mechanisms (such as config overrides to inject component properties, builtin); Full expressivity of the workload doesn’t quite exist
- All operators provide comparable performance

# Summary
Each option provides different levels of features, flexibility, and complexity. Strimzi and CFK are robust and feature-rich solutions that offer comprehensive management capabilities for Kafka on Kubernetes. KOperator provides additional flexibility and multi-cluster support. The Redpanda operator for Kubernetes makes it easy to deploy, manage, and scale Redpanda clusters, providing automated management and self-healing capabilities.
