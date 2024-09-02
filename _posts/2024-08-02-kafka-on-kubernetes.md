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
Kubernetes (or K8S) is an open source system for automating deployment, scaling and management of containerized applications. It was originally developed by Google, inspired from their experience of deploying scalable, reliable systems in containers via application-oriented APIs. Since its introduction in 2014, Kubernetes has grown to be one of the largest and most popular open source projects in the world. It has become the standard API for building cloud native applications, present in nearly every public cloud. Apache Kafka is a distributed streaming platform that is used as a backbone for an organization's data infrastructure. So, organizations that build, deploy, manage/operate cloud native applications look at running Kafka on K8S to take advantage of everything that K8S offers (scaling, recovery from failures, optimal use of resources).


# Key Characteristics of Kafka
Based on the release timeline (Zookeeper 3.0 released in 2008, Kafka released in 2011, Docker in 2013 and Kubernetes in 2014), Kafka (and in turn Zookeeper) predate native container based applications. So, they fall into the category of applications that are containerized though they were not built to be run in containers. Also, we need to make them Stateful (brokers store data into files and cache the data in the filessytem cache), have the producers/consumers know the existence of brokers, have the ability for each broker to connect to others, and be able to recover back after a pod goes down (a pod in Kubernetes consists of one/more containers that work together to offer a set of features. One design option is to containerize Kafka/Zookeeper and build each one into a pod which can then be handled by Kubernetes).

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

## How do we model the Kafka/Zookeeper Resources?
Kubernetes supports several native resources to manage and orchestrate containers. Some of them are Pods, Nodes, Namespaces, ReplicationController, ReplicaSet, StatefulSets, Services, Endpoints, ConfigMaps, Secrets, PersistentVolumes, PersistentVolumeClaims, Ingress, Custom Resource Definitions (CRDs) and Roles/RoleBindings among others. So, what we see is that Kafka related resources are not natively supported. But, Kubernetes provides extensibility via CRDs to model a cluster, Connect/Connector, Mirror Maker (to replicate records across Kafka clusters), Kafka Users, Topics, Prometheus Metric, and Security (TLS, SCRAM, Keycloak). 

## How do we model the infrastructure?
*** StatefulSet*** : a StatefulSet is a Kubernetes resource designed for stateful applications. So, we can model both Kafka/Zookeeper as a StatefulSet which guarantees:
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

## How do we take care of Resource Management?
Kubernetes provides a pattern called the ***Operator***. Any complex stateful workload (like Kafka) that can’t be run as a fully managed service can be provided as a Kubernetes operator. This allows us to proactively manage custom resources (created via the CRDs). Operators are very powerful and they enable users to get custom abstractions that are responsible for deployment, health check and repair of the custom resources (e.g., Kafka Cluster, Topic).

<div class="mermaid">
graph TD
    A[Kubernetes API Server] -->|Watches| B[Controller]
    B -->|Reads Desired State| C[Etcd - Cluster State Store]
    B -->|Reads Actual State| D[Kubernetes Resources e.g. Pods, Nodes]
    B -->|Reconciles| E[Adjusts Kubernetes Resources]
    C -->|Stores Updated State| A
    E -->|Updates| A
</div>

Operator Components:
- Kubernetes API Server (A): The central management point for the cluster, providing the interface for all resource operations.
- Controller (B): A control loop that watches the desired state in the API Server, compares it with the actual state of resources, and takes action to reconcile the differences.
- Etcd (C): The key-value store where Kubernetes stores its desired state and cluster configuration.
- Kubernetes Resources (D): The actual state of resources (e.g., Pods, Nodes) in the cluster.
- Reconciliation Process (E): The controller adjusts the resources as needed to align the actual state with the desired state stored in etcd.

Extending the Operator pattern to model Kafka resources could have CRDs for Topic, Kafka Cluster, Zookeeper. The Controllers: Kafka Operator and Zookeeper Operator read the CRDs, create the resources and run reconciliation loops to maintain the desired state.

<div class="mermaid">
flowchart TD
    subgraph KubernetesCluster["Kubernetes Cluster"]
        direction TB
        subgraph Controllers["Controllers"]
            KOperator["Kafka Operator"]
            ZOperator["Zookeeper Operator"]
        end

        subgraph KafkaResources["Kafka Resources"]
            KafkaCluster["Kafka Cluster"]
            ZookeeperCluster["Zookeeper Cluster"]
            KafkaTopics["Kafka Topics"]
        end
        
        subgraph ManagedResources["Managed Resources"]
            Brokers["Kafka Brokers"]
            ZKNodes["Zookeeper Nodes"]
        end
        
        subgraph CustomResources["Custom Resources"]
            KCR["Kafka Custom Resource"]
            ZKCR["Zookeeper Custom Resource"]
            TopicCR["Kafka Topic Custom Resource"]
        end
    end


    KOperator --> KafkaCluster
    ZOperator --> ZookeeperCluster
    KOperator --> KafkaTopics
    KOperator --> Brokers
    ZOperator --> ZKNodes

    KCR --> KOperator
    ZKCR --> ZOperator
    TopicCR --> KOperator

    
    Brokers -- depends on --> ZKNodes
    KafkaCluster -- managed by --> KOperator
    ZookeeperCluster -- managed by --> ZOperator

%% Styling
    classDef kafkaStyle fill:#e0f7e9,stroke:#4caf50,stroke-width:2px;
    class K1,K2 kafkaStyle;
    classDef default font-size:16px;
    
</div>

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

It is really hard to get deep into K8S, model the Kafka resources and implement the Operator pattern to have a production ready system that can achieve the objectives. But, there is help!

# Deployment Options to run Kafka on K8S
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

<div class="mermaid">
flowchart LR
 
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
    CO["Cluster Operator"]
 end

 subgraph KCO[" "]
    K1
    EO
  end

subgraph SZ["Strimzi"]
    KCO
    TCR
    CO
    UCR
    KCR
 end

subgraph KC["Kubernetes Cluster"]
    SZ
 end


KCO <--> CO <-- Deploys & Manages --> K1
TO <--> TCR["Topic Custom Resources"]
UO <--> UCR["User Custom Resources"]
CO <--> KCR["Kafka Custom Resources"]
    
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

<div class="mermaid">
flowchart TB

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

<div class="mermaid">
flowchart TD

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
 K1
 PS
 G
 TCR
 UCR
 KCR
 CCO
 end


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

    KO <--> TCR["Topic Custom Resources"]
    KO <--> UCR["User Custom Resources"]
    KO <--> KCR["Kafka Custom Resources"]
    KO <--> CCO["Cruise Control Operation"]

    %% Styling
    classDef kafkaStyle fill:#e0f7e9,stroke:#4caf50,stroke-width:2px;
    class K1,K2 kafkaStyle;
    classDef default font-size:16px;
</div>

## Feature Comparison


### **Operator Core**

| | CFK    | Strimzi      | KOperator       |
| :---        | :---        | :---:         | ---:           |
| **Workload Type** | StatefulSet        | StrimziPodSet         | Pod           |

| **CRs supported**|ClusterLink ConfluentRoleBinding Connector Connect ControlCenter KafkaRestClass KafkaRestProxy| Kafka KafkaBridge KafkaConnector KafkaUser KafkaMirrorMaker2 | KafkaCluster KafkaTopic KafkaUser CruiseControlOperation  |
| **Networking Models**| Loadbalancer NodePort Ingress      | Loadbalancer NodePort Ingress        | Loadbalancer (envoy or Istio ingress) NodePort Ingress         |
| **Storage** | * Supports Tiered Storage *   | Generic CSI with PVs     | Generic CSI with PVs |



### **Security**

| | CFK    | Strimzi      | KOperator       |
| :---        | :---        | :---:         | ---:           |
| mTLS (with auto provisioning of certificates) | Yes        | Yes         | Yes with Istio           |
| SASL/PLAIN (with k8s secrets) | Yes        | Yes         | No           |
| SASL/PLAIN (with volume mounts) | Yes        | Yes         | No           |
| SASL/PLAIN (with LDAP) | Yes        | No         | No           |
| SASL/SCRAM-SHA-* | No        | Yes         | No           |
| SASL/OAUTHBEARER | No        | Yes         | No           |
| SASL/GSSAPI | No        | No         | No           |
| Kubernetes RBAC | No        | No         | Yes with K8S namespaces and SA           |



### **Authorization**

| | CFK    | Strimzi      | KOperator       |
| :---        | :---        | :---:         | ---:           |
| ACL | Yes        | Yes         | Yes with Envoy           |
| RBAC | Yes        | No         | No           |



### **Security**

| | CFK    | Strimzi      | KOperator       |
| :---        | :---        | :---:         | ---:           |
| Self balancing | Automatic Self Balancing        | Cruise Control         | Cruise Control           |
| Monitoring add-ons | Control Center, Confluent Health+, JMX        | JMX, Cruise Control         | JMX, Cruise Control           |
| Disaster recovery | Replicator, ClusterLink. Also support Multi-region clusters        | MirrorMaker2         | MirrorMaker2           |
| Scale up/out | kubectl scale with Self Balancing        | Non-broker components - K8S HPA and KEDA. Broker - Manual scaling with Strimzi Drain Cleaner         | Autoscaling with Cruise Control           |



# Summary
- Running Kafka on K8S can be a lot of toil, without an operator. You can make a choice based on your environment, features, licensing and other specialized purposes.
- Each operator has its own opinion based on the realities it was designed for.
  - Kafka is ultimately not “k8s native”. The operator only provides so much operational sugar
  - As a result, there are several shoehorning mechanisms (such as config overrides to inject component properties, builtin); Full expressivity of the workload doesn’t quite exist
- All operators provide comparable performance.
- Preferably, package all the resources in a higher order Helm chart with GitOps style deployments.