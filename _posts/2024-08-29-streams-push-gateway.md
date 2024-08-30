---
layout: post
title: "Kafka Streams Push Gateway"
authors: raghav
categories: [Platform Engineering, Infrastructure, Kafka, Kafka Streams, Web Socket, API Gateway, Kong]
image: assets/blog-images/streams-push-gateway/streams-push-gateway-architecture.png
featured: false
hidden: false
teaser: Kafka Streams Push Gateway
toc: true
---

# Introduction
Organizations like DoorDash/UberEats/Swiggy/Zomato that take orders from customers and use an operational database to store the orders and keep updating the status of the orders. Status update needs to be visible for customers to make sure that they know what is happening to their orders (e.g., order accepted, order in progress, order ready for delivery, order is on route, and order is delivered, among the many possible states). hello

# What’s needed to Implement this System?
To send these updates to customers (possibly hundreds or thousands per second), they need to get the updates from their suppliers (Kitchens, Restaurants), update their operational database, capture the changes (Change Data Capture or CDC) into a Kafka Topic, have consumers read the records in the Kafka Topic, sift through the ones that need to be updated, maintain connections to the customers and send the updates. In doing all this, they need to make sure that they take care of failures that occur during the updates (possibly using durable execution via Temporal Workflows and Activities).

## Illustrative Steps to Implementing Real-Time Order Updates
1. Centralize Data: Store all relevant order data in a Kafka topic.
2. Schema Management: Ensure the data in Kafka has a well-defined schema.
3. Stream Processing: Develop a Kafka Streams application to process updates as they become available.
4. Key Mapping: Implement a mechanism to map topics/partitions to orders/users.
5. Stream Topology: Define a stream topology with a GroupBy key operation, repartition the topic, and make the data accessible via a web interface.
6. Client Communication: Implement a polling or asynchronous mechanism (like WebSockets) to push updates to clients.


# Our Solution - Steams Push Gateway Accelerator
We have built a system that takes care of automatically subscribing to updates related to specific data present in the records/messages in the Kafka Topic and routing them to the subscribers.

<div class="mermaid">
flowchart TD

%% Subgraphs for better organization


subgraph KC[Kafka Cluster]
    T1(Kafka Topic 1)
    P1(Partition 1)
    P2(Partition 2)
    P3(Partition 3)
end

subgraph Application1
    APP1[Kafka Streams Application]
    REST1[REST Endpoint]
    STORE1[RocksDB Store]
    APP1 -->|reads/stores data| STORE1
    REST1 --> APP1    
end

subgraph Application2
    APP2[Kafka Streams Application]
    REST2[REST Endpoint]
    STORE2[RocksDB Store]
    APP2 -->|reads/stores data| STORE2
    REST2 --> APP2    
end

subgraph SA[Streams Applications]
    Application1
    Application2
end

subgraph API_Gateway
    API[Kong API Gateway]
end

subgraph Clients
    CLIENTS[Client]
end

%% Edge connections between nodes

API -->|forwards requests| REST1
CLIENTS -->|request updates for specific keys| API
APP1 -->|sends updates via Upgraded Websocket connection| CLIENTS

API -->|forwards requests| REST2
APP2 -->|sends updates via Upgraded Websocket connection| CLIENTS

%% Connection between Kafka brokers and Kafka streams applications
T1 -->|partitioned data| P1
T1 -->|partitioned data| P2
T1 -->|partitioned data| P3
P1 -->|reads data| APP2
P2 -->|reads data| APP1
P3 -->|reads data| APP1

APP1 <-->|forward requests| REST2
APP2 <-->|forward requests| REST1

    %% Styling
    classDef kafkaStyle fill:#e0f7e9,stroke:#4caf50,stroke-width:2px;
    class K1,K2 kafkaStyle;
    classDef default font-size:16px;
</div>

## Overview of the System

### Order Updates Flow
1. ***Order Service***: Publishes updates to a database containing customer_id and order_id.
2. ***CDC Integration***: A Kafka Connect application captures CDC updates and writes them to a Kafka topic.
3. ***Kafka Streams Application***: Consumes this data, groups it by key fields (e.g., order_id or customer_id), and stores it locally after performing a GroupBy operation.

### Client Communication
1. A mobile application requests updates for a specific order via an API Gateway, which forwards the request to the Kafka Streams application.
2. The connection is upgraded to a WebSocket, through which the Kafka Streams application sends regular updates (configurable interval) back to the client.

### API Gateway
1. The API Gateway handles authentication, authorization, and request/response transformations.
2. It provides load balancing by routing calls to different Kafka Streams Application instances, ensuring even distribution of traffic and avoiding single points of failure.

## API Gateway
API Gateway (we recommend and use Kong that) can do the authentication. Also, provide load balancing to route the calls to a different Kafka Streams Application through an upstream (which is a Kong construct for load balancing across multiple targets with each target consisting of the hostname:port).

Refer the [upstreams](https://docs.konghq.com/gateway/latest/key-concepts/upstreams/) documentation from Kong to create the upstream.

## Kafka Streams Application
The Kafka Streams application consists of:
1. ***Declarative Configuration***: Specifies the Kafka bootstrap servers, application ID, state store location, input/output topics, and keys for the GroupBy operation.
2. ***REST Endpoint***: Configured as an upstream target for the API Gateway, enabling other Kafka Streams instances to query keys not present in their local store.
3. ***Stream Topology***: Manages the GroupBy operation for the specified key (e.g., order_id).
4. ***WebSocket Communication***: Upgrades incoming connections to WebSocket and publishes updates.
5. ***Data Routing***: Routes requests to the correct host if the requested key is not available locally.

### Declarative configuration
The Kafka Streams Application can use the below declarative configuration which will be used to start the application.

```yaml
  kafka:
    bootstrap-servers: localhost:9092
    streams:
      application-id: kafka-streams-app
      default-key-serde: org.apache.kafka.common.serialization.Serdes$StringSerde
      default-value-serde: org.apache.kafka.common.serialization.Serdes$StringSerde
      properties:
        commit.interval.ms: 1000
        cache.max.bytes.buffering: 10485760
      state-dir: /tmp/kafka-streams

    consumer:
      group-id: kafka-streams-group
      auto-offset-reset: earliest

    producer:
      retries: 3
      batch-size: 16384
      buffer-memory: 33554432

topics:
  input-topic: orders
  output-topic: orders-by-key

application:
  stream:
    group-by-key-enabled: true
    group-by-key-operation:
      # the key could be any field within the record and can be
      # addressed using a format like ‘orders.items.item_id’
      key: order_id
      description: Group orders by their key (e.g., order ID or customer ID)

update:
  interval:5000
  description: Send updates to clients periodically using the interval (5000 means 5 seconds)
```


## REST Endpoint
1. Retrieve the status of an order using the endpoint: /update/orders/{order_id}.
2. Implemented using Spring Boot and integrated into the Kafka Streams Application.


### Web Socket Implementation

The ```WebSocketConfig``` configuration class registers the handler and the path to listen to.

```java
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
   private final KeyValueHandler keyValueHandler;

   @Autowired
   public WebSocketConfig(KeyValueHandler keyValueHandler) {
       this.keyValueHandler = keyValueHandler;
   }

   @Override
   public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
       registry.addHandler(keyValueHandler, "/update/orders/{key}")
       .addInterceptors(new KeyValueInterceptor())
       .setAllowedOrigins("*");
   }
}
```

We implement the logic to retrieve the data (only relevant methods are shown here)
```java
private void sendMessage(WebSocketSession session) throws IOException {
   String key = (String) session.getAttributes().get("key");

   final HostStoreInfo hostStoreInfo = streamsMetadataForStoreAndKey(storeName, key);
   if (!thisHost(hostStoreInfo)){
       session.sendMessage(new TextMessage(fetchByKey(hostStoreInfo, "update/orders/"+ key).toString()));
   }

   final ReadOnlyKeyValueStore<String, Long> store =
           kafkaStreams.store(fromNameAndType(storeName, QueryableStoreTypes.keyValueStore()));
   if (store == null) {
       throw new NotFoundException();
   }

   // Get the value from the store
   final String value = store.get(key);
   if (value == null) {
       throw new NotFoundException();
   }
   session.sendMessage(new TextMessage(new KeyValueBean(key, value).toString()));
}
```

Retrieve the data from the host that has the actual data (routing to a different host)
```java
private boolean thisHost(final HostStoreInfo host) {
   return host.getHost().equals(hostInfo.host()) &&
           host.getPort() == hostInfo.port();
}

private KeyValueBean fetchByKey(final HostStoreInfo host, final String path) {
   String url = String.format("http://%s:%d/%s", host, port, path);

   // Make the GET request
   ResponseEntity<KeyValueBean> response = restTemplate.getForEntity(url, KeyValueBean.class);

   // Return the body of the response
   return response.getBody();
}

public HostStoreInfo streamsMetadataForStoreAndKey(final String store,
                                                  final String key) {
   return metadataService.streamsMetadataForStoreAndKey(store, key, new StringSerializer());
}
```

### Client
The client could be a mobile application that makes a connection to the Kafka Streams application via the API Gateway. The connection gets upgraded to a web socket connection and the data is received at regular intervals (configured in the streams application). Once the client has received all the updates, it can close the connection.

### Websocket payload and response

A HTTP Get connection is upgraded to a Web Socket Secure (WSS) connection. The payload structure of a WebSocket message depends on the protocol and use case. Here’s an example of a WebSocket request payload in JSON format, which is common in many real-time applications.

Client to Server (Requesting Order Updates for a specific Order id)
```json
{
  "type": "order_status_updates_request",
  "data": {
    "order_id": "12345"
  }
}
```

Server to Client (Sending Order Updates)
```json
{
  "type": "order_status_update",
  "data": {
    "order_id": "12345",
    "status": "Shipped",
    "estimated_delivery": "2024-08-28",
    "tracking_number": "1Z999AA10123456784"
  }
}
```

Wscat commands with Basic Authentication (handled by the API Gateway)
```bash
echo -n "username:password" | base64
# Assume that the base64 encoding results in “dXNlcm5hbWU6cGFzc3dvcmQ=”

# call the order updates api via the Kong API gateway with basic authentication
wscat -c "wss://localhost:8000/update/orders" -H "Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ="
```

After the successful connection, send 
```json
{
  "type": "order_updates_request",
  "order_id": "12345" 
}
```

# Conclusion
The Streams Push Gateway Accelerator leverages Kafka Streams, RESTful endpoints, and WebSockets to deliver a robust, scalable solution for pushing real-time order updates to clients. By integrating with an API Gateway and employing efficient stream processing techniques, this solution ensures that customers receive timely updates on their orders, enhancing the user experience.

Please contact us at [hello@platformatory.com](mailto:hello@platformatory.com) to discuss your use case and we would be happy to help!

# References
 Confluent Kafka Streams Interactive Queries: [Link](https://docs.confluent.io/platform/current/streams/developer-guide/interactive-queries.html)