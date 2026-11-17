---
layout: post
title: "Unified access layer for Kafka resources: Part 2A: Python Client SDK"
authors: p6, ashwin
categories: [Platform Engineering, Infrastructure, Kafka, Unified Access Layer]
image: assets/blog-images/unified_access_layer/rule_based_routing_layer.png
featured: false
hidden: false
teaser: Unified access layer for Kafka resources, Part 2A, Python Client SDK Rule Based Routing Layer 
toc: true
---

# Introduction

Kafka is client-heavy: clients choose topics, auth and tuning; brokers only throttle. With central governance, every topic, credential or cluster migration waits on app teams. A **unified access layer** removes cluster specifics from clients ([Part 1](https://platformatory.io/blog/unified-access-layer-kafka-resources-part-1/)). This post is the Python SDK for the rule-based routing layer ([Part 2](https://platformatory.io/blog/unified-access-layer-part-2-rule-based-routing/) covers the catalog service and Java SDK).

Flow: authenticated REST call to the catalog with intent (channel, client ID, config profile) → bootstrap servers, topic mapping, mediated credentials and tuned config → cache with TTL → Kafka client.

# Python client SDK

Design goals: minimal code change for apps; wrap `confluent-kafka`, don't reimplement it.

## Catalog response

One call returns everything a client needs:

```python
{
  "channel_mapping": {"bar": "c0t3", "baz": "c0t2"},          # channel → topic
  "connection":     {"bootstrap.servers": "<cluster>:9092"},
  "credentials":    {"security.protocol": "SASL_SSL", "sasl.mechanisms": "PLAIN",
                     "sasl.username": "...", "sasl.password": "..."},
  "configuration":  {"acks": "all", "retries": 3}             # from the config profile
}
```

Clients address **channels** (`kafka://example.com/bar`), never topics or clusters. Request parameters: `config_profile` (e.g. `durableWrite`, `highThroughputConsumer`), one or more `channel`s, plus nested `additional_params` (e.g. `kafka.env=prod`).

## Producer wrapper

`platformatory_kafka.Producer` fetches and caches config per channel (TTL), builds the underlying producer from `connection + credentials + configuration + client.id`, and resolves the topic on every `produce`:

```python
def produce(self, channel, value, key=None, partition=None, on_delivery=None, **kw):
    if self.producer is None:
        self.producer = ConfluentProducer(self._merge_config(self._fetch_service_config(channel)))
    topic = self._fetch_service_config(channel)['channel_mapping'][channel.split('/')[-1]]
    self.producer.produce(topic=topic, value=value, key=key, callback=on_delivery, **kw)
```

App code barely changes: catalog details in config, a channel instead of a topic.

```python
producer = Producer({
    'service_gateway_uri': 'http://kong:8000/servicegw',
    'basic_auth': ('user1', 'password1'),
    'client_id': 'foo',
    'config_profile': 'durableWrite',
    'ttl': 300,
    'additional_params': {'kafka': {'env': 'prod'}, 'config_profile': {'type': 'producer', 'env': 'prod'}},
})
producer.produce(channel='kafka://example.com/bar', value=msg, on_delivery=delivery_report)
producer.flush()
```

```
DEBUG:root:Fetched config: {'channel_mapping': {'bar': 'c0t3'}, ... 'configuration': {'acks': 'all', 'retries': 3} ...}
DEBUG:root:Producing message to topic: c0t3
```

## Consumer wrapper

`platformatory_kafka.Consumer.subscribe(channels)` fetches config for all channels in one call, builds the consumer and subscribes to the mapped topics. Before every `poll` / `consume` it re-checks the catalog; if config or mapping changed, it re-subscribes with the new config:

```python
def _check_for_updates(self):
    is_new_config, _ = self._fetch_service_config(self.current_channels)
    if is_new_config:
        self.subscribe(self.current_channels)   # rebuild client, new topics/config
```

```python
consumer = Consumer({..., 'config_profile': 'highThroughputConsumer', 'ttl': 60})
consumer.subscribe(['kafka://example.com/bar', 'kafka://example.com/baz'])   # → c0t3, c0t2
while True:
    msg = consumer.poll(1.0)
```

```
DEBUG:root:Subscribing to topics: ['c0t3', 'c0t2']
DEBUG:root:Message received from topic c0t3: Message 23: 34 | Time: 2024-08-13 07:38:39
```

Note: as written, the consumer hits the catalog on every poll; production code should check only once the TTL expires.

# Conclusion

Thin wrappers over `confluent-kafka` give Python clients dynamic topics, credentials and config profiles from the routing layer. Next: package as a library.
