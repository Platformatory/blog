---
layout: post
title: "Unified access layer for Kafka resources: Part 2: Rule Based Routing Layer"
authors: p6,raghav
categories: [Platform Engineering, Infrastructure, Kafka, Unified Access Layer]
image: assets/blog-images/unified_access_layer/rule_based_routing_layer.png
featured: false
hidden: false
teaser: Unified access layer for Kafka resources, Part 2, Rule Based Routing Layer
toc: true
---

# Introduction

Implementation of Approach 1 from [Part 1](https://platformatory.io/blog/unified-access-layer-kafka-resources-part-1): clients discover cluster and topic from a catalog service via a thin SDK, instead of hard-coding them.

## Catalog service (Kong)

- A Kong service fronting the catalog upstream, on route `/kafka-service-gw`
- A custom (or pre/post-function) plugin with rules mapping query parameters (channel, service type, organisation) to bootstrap servers and topic, ideally in one call
- Basic Auth on every call

Code: [Platformatory/kong-service-gateway](https://github.com/Platformatory/kong-service-gateway).

## Java SDK: service-locator facades

`ServiceLocatorProducer` and `ServiceLocatorConsumer` wrap `KafkaProducer` / `KafkaConsumer`:

1. Query the catalog for bootstrap servers and topic (Basic Auth, OkHttp).
2. Cache the answer with a short TTL (Guava `LoadingCache`, 5 s).
3. On every `send` / `poll`, compare the cached answer with the live client; on change, rebuild the client and switch topics.

Producer switch logic:

```java
public Future<RecordMetadata> send(ProducerRecord record, Callback cb) {
    String bootstrap = cache.get(CACHE_KEY).get(BOOTSTRAP_SERVERS_CONFIG);
    String topic     = cache.get(CACHE_KEY).get(KAFKA_TOPIC_KEY);
    if (properties.get(BOOTSTRAP_SERVERS_CONFIG).equals(bootstrap) && record.topic().equals(topic)) {
        return kafkaProducer.send(record, cb);
    }
    close();                                            // route changed
    properties.put(BOOTSTRAP_SERVERS_CONFIG, bootstrap);
    kafkaProducer = new KafkaProducer(properties);
    return kafkaProducer.send(new ProducerRecord<>(topic, record.key(), record.value()), cb);
}
```

Consumer switch logic: on a cluster or topic change, unsubscribe, close, recreate, resubscribe.

```java
public ConsumerRecords<K, V> poll(Duration d) {
    String bootstrap = cache.get(CACHE_KEY).get(BOOTSTRAP_SERVERS_CONFIG);
    String topic     = cache.get(CACHE_KEY).get(KAFKA_TOPIC_KEY);
    if (!properties.get(BOOTSTRAP_SERVERS_CONFIG).equals(bootstrap) || !listTopics().containsKey(topic)) {
        properties.put(BOOTSTRAP_SERVERS_CONFIG, bootstrap);
        unsubscribe(); close();
        kafkaConsumer = new KafkaConsumer<>(properties);
        kafkaConsumer.subscribe(List.of(topic));
    }
    return kafkaConsumer.poll(d);
}
```

Apps drop `bootstrap.servers` and the hard-coded topic; everything else (acks, serdes, group ID) stays:

```java
Properties config = new Properties();
config.put(ACKS_CONFIG, "all");
config.put(KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getCanonicalName());
config.put(VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getCanonicalName());

try (var producer = new ServiceLocatorProducer<String, String>(config)) {
    producer.send(new ProducerRecord<>(producer.getTopic(), key, value), callback);
}
```

## In action

The catalog route changes mid-run (3 brokers → 2, topic `users` → `users-1`). Both clients follow without a restart:

```
bootstrap:localhost:9092,localhost:9093,localhost:9094
Produced event to topic users: key = joe        value = myers
...
bootstrap:localhost:9092,localhost:9093
Need to update bootstrap servers config to {localhost:9092,localhost:9093} and the topic config to {users-1} and create a new Producer
Produced event to topic users-1: key = joe        value = crease
```

```
Consumed event from topic users: key = justie     value = myers
...
Need to update bootstrap servers config to {localhost:9092,localhost:9093} from {localhost:9092,localhost:9093,localhost:9094} and create a new Consumer
Consumed event from topic users-1: key = joe        value = crease
```

Python SDK: coming soon.

# Conclusion

Clients stop owning cluster and topic topology; the platform team changes routes centrally and clients follow. That's the indirection that makes migrations, failovers and topic moves routine.
