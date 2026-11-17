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

Apache Kafka is a client heavy protocol i.e. publishers/consumers get to decide the topics to connect with, authentication mechanism to use (will need to be supported by brokers) and tune their configuration for better performance. The Kafka brokers only throttle the clients and do not enforce any specific client configurations. General pattern for Kafka cluster management across many companies is centralized governance i.e. a centralized platform team manages clusters, topics, permissions, credentials etc. In these scenarios, migrating topics, credentials and clusters becomes a daunting task considering the dependency on the application teams to implement the changes in a effective manner. 

One way to solve this issue is to have a “**Unified Access Layer for Kafka resources**” which is a proxy layer between Kafka clusters and clients providing the clients insulation from the cluster specific information. Go through in detail the different approaches to constructing a Unified Access Layer for Kafka resources in the [Part-1](https://platformatory.io/blog/unified-access-layer-kafka-resources-part-1/) of this blog series.

# Rule Based Routing Layer

One of the approaches for the Unified Access Layer for Kafka resources is to have a Rule Based Routing Layer (Catalog service) which contains the metadata of the topics and their mapping with the clients. You will use a Language specific SDKs which knows how to talk to the Catalog service and fetch the required details to connect to the Kafka cluster.

Typically, the client here would, before instantiating a Kafka client, locate the target Kafka service using

- A HTTP/REST call to the Catalog service (using some form of security: Such as basic auth or OAuth)
    - Express an intent (such as to produce or consume) on a certain topic or domain of topics (such as prefix pattern) OR by the virtue of it’s client ID, be routed to the appropriate cluster
- Receive the Kafka bootstrap location
    - Optionally, mediated credentials for both Kafka and typically, Schema registry
- The above, being cached with a TTL
- Return a Kafka client instance

For more details on the implementation of the Catalog service and the Java Client SDK to talk to Catalog service, refer to the [Part-2](https://platformatory.io/blog/unified-access-layer-part-2-rule-based-routing/) of this blog series

# Python Client SDK

In this blog, we will focus on the Python implementation of the custom SDK to talk to the Rule Based Routing Layer (Catalog service). Before we delve into the code, let’s understand some of the considerations for the implementation,

- The code changes required for transitioning to the Client SDK should be as minimal as possible
- Use the capabilities of a well maintained Python library for Kafka i.e. not to write new Producer and Consumer instances from scratch.

We will make use of the `confluent-kafka` Python library as the base class for building the custom Kafka producer and consumer. 

## Kafka Producer Wrapper

We need a custom producer (`platformatory_kafka.Producer`) that can call the Catalog Service passing in the required information to locate the bootstrap servers and the topic. The custom producer class for the Catalog service implementation will be as below:

```python
import time
import requests
import logging
from urllib.parse import urlencode, quote_plus
from confluent_kafka import Producer as ConfluentProducer

logging.basicConfig(level=logging.DEBUG)

class Producer:
    def __init__(self, config):
        self.service_gateway_uri = config.get('service_gateway_uri')
        self.basic_auth = config.get('basic_auth')
        self.client_id = config.get('client_id')
        self.config_profile = config.get('config_profile')
        self.ttl = config.get('ttl', 300)
        self.additional_params = config.get('additional_params', {})
        self.cache = {}
        self.cache_time = {}

        if not self.service_gateway_uri:
            raise ValueError("Service gateway URI must be set in the configuration")
        if not self.config_profile:
            raise ValueError("Config profile must be set in the configuration")

        self.producer_config = None
        self.producer = None

    def _is_cache_valid(self, key):
        return key in self.cache and (time.time() - self.cache_time[key]) < self.ttl

    def _encode_nested_params(self, params, prefix=''):
        """Encode nested query parameters."""
        encoded_params = {}
        for k, v in params.items():
            if isinstance(v, dict):
                encoded_params.update(self._encode_nested_params(v, prefix=f'{prefix}{k}.'))
            else:
                encoded_params[f'{prefix}{k}'] = v
        return encoded_params

    def _fetch_service_config(self, channel):
        if not self._is_cache_valid(channel):
            try:
                logging.debug(f"Fetching service config for channel: {channel}")
                query_params = {
                    'config_profile': self.config_profile,
                    'channel': channel
                }
                # Encode additional parameters
                encoded_params = self._encode_nested_params(self.additional_params)
                query_params.update(encoded_params)
                query_string = urlencode(query_params, quote_via=quote_plus)
                response = requests.get(
                    f"{self.service_gateway_uri}?{query_string}",
                    auth=self.basic_auth
                )
                response.raise_for_status()
                new_config = response.json()
                self.cache[channel] = new_config
                self.cache_time[channel] = time.time()
                logging.debug(f"Fetched config: {self.cache[channel]}")
            except requests.exceptions.RequestException as e:
                logging.error(f"Failed to fetch service config for channel {channel}: {e}")
                raise
        else:
            time_left = self.ttl - (time.time() - self.cache_time[channel])
            logging.debug(f"Using cached config for channel: {channel}. Time left for cache refresh: {time_left:.2f} seconds")
        return self.cache[channel]

    def _merge_config(self, config):
        merged_config = {}
        merged_config.update(config['connection'])
        merged_config.update(config['credentials'])
        merged_config.update(config['configuration'])
        merged_config['client.id'] = self.client_id
        return merged_config

    def _get_initial_config(self, channel):
        config = self._fetch_service_config(channel)
        initial_config = self._merge_config(config)
        return initial_config

    def produce(self, channel, value, key=None, partition=None, on_delivery=None, *args, **kwargs):
        if not channel:
            raise ValueError("Channel must be set for producing messages")

        if self.producer is None:
            self.producer_config = self._get_initial_config(channel)
            self.producer = ConfluentProducer(self.producer_config)

        service_config = self._fetch_service_config(channel)
        topic = service_config['channel_mapping'][channel.split('/')[-1]]

        logging.debug(f"Producing message to topic: {topic}")
        logging.debug(f"Parameters - value: {value}, key: {key}, partition: {partition}, on_delivery: {on_delivery}, args: {args}, kwargs: {kwargs}")
        
        try:
            if partition is None:
                self.producer.produce(
                    topic=topic, value=value, key=key, callback=on_delivery, *args, **kwargs
                )
            else:
                self.producer.produce(
                    topic=topic, value=value, key=key, partition=partition, callback=on_delivery, *args, **kwargs
                )
        except Exception as e:
            logging.error(f"Error in producing message: {e}")
            raise

        logging.debug(f"Message produced to topic: {topic}")

    def poll(self, timeout):
        if self.producer is not None:
            self.producer.poll(timeout)

    def flush(self):
        if self.producer is not None:
            self.producer.flush()
```

As observed, the wrapper code calls the Catalog service to fetch the topic and configuration details on the invocation of `produce` method. It also initializes the `Producer` instance with the fetched configuration and produces the message to the dynamically fetched topic. 

## Producer App

We will create a Producer App which utilizes the above mentioned Producer wrapper to fetch the topics details and produce some messages. 

```python
import time
import random
from datetime import datetime
from platformatory_kafka.producer import Producer  # Import the Producer wrapper 

# Pass in the Catalog service details and producer client-id
producer_config = {
    'service_gateway_uri': 'http://kong:8000/servicegw',
    'basic_auth': ('user1', 'password1'),
    'client_id': 'foo',
    'config_profile': 'durableWrite',  # Config profile from user code
    'ttl': 300,  # TTL set to 5 minutes (300 seconds)
    'additional_params': {  # Additional query parameters
        'kafka': {'env': 'prod'},
        'config_profile': {'type': 'producer', 'env': 'prod'}
    }
}

# Initialize the producer
producer = Producer(producer_config)

def delivery_report(err, msg):
    """Called once for each message produced to indicate delivery result.
    Triggered by poll() or flush()."""
    if err is not None:
        print(f'Message delivery failed: {err}')
    else:
        print(f'Message delivered to {msg.topic()} [{msg.partition()}]')

sequence_number = 0

while True:
    # Generate a random message with a sequence number and a human-readable timestamp
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    message = f"Message {sequence_number}: {random.randint(1, 100)} | Time: {current_time}"

    # Trigger any available delivery report callbacks from previous produce() calls
    producer.poll(0)

    # Asynchronously produce a message. The delivery report callback will
    # be triggered from the call to poll() above, or flush() below, when the
    # message has been successfully delivered or failed permanently.
    producer.produce(channel='kafka://example.com/bar', value=message.encode('utf-8'), on_delivery=delivery_report)

    # Wait for any outstanding messages to be delivered and delivery report
    # callbacks to be triggered.
    producer.flush()

    # Increment the sequence number
    sequence_number += 1

    # Sleep for a while to simulate a slow producer
    time.sleep(5)  # Adjust the sleep duration as needed
```

The following details will be passed into the custom Producer to connect with Catalog service and get required configs,

1. Service Gateway URL for the Catalog service
2. Basic Auth details to authenticate with Catalog service
3. Unique client ID for the producer
4. The `configProfile` type for the Producer configurations
5. The cache TTL for the configs fetched from the Catalog service

When the `produce` method is called we send the `channel` value which determines the topic(s) the producer intends to publish to based on the pre-defined routing rules in the Catalog service layer. The rest of the code is similar to the general `confluent-kafka` Python code.

## Producer in Action

Logs of the custom producer during execution:

```bash
DEBUG:root:Fetching service config for channel: kafka://example.com/bar
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
**DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=durableWrite&channel=kafka%3A%2F%2Fexample.com%2Fbar&kafka.env=prod&config_profile.type=producer&config_profile.env=prod HTTP/11" 200 353**
**DEBUG:root:Fetched config: {'channel_mapping': {'bar': 'c0t3'}, 'credentials': {'sasl.password': 'REDACTED', 'security.protocol': 'SASL_SSL', 'sasl.mechanisms': 'PLAIN', 'sasl.username': 'REDACTED'}, 'configuration': {'acks': 'all', 'retries': 3}, 'connection': {'bootstrap.servers': 'pkc-41p56.asia-south1.gcp.confluent.cloud:9092'}}**
**DEBUG:root:Using cached config for channel: kafka://example.com/bar. Time left for cache refresh: 299.97 seconds**
DEBUG:root:Producing message to topic: c0t3
DEBUG:root:Parameters - value: b'Message 0: 77 | Time: 2024-08-13 07:36:41', key: None, partition: None, on_delivery: <function delivery_report at 0x7f19dcef11f0>, args: (), kwargs: {}
DEBUG:root:Message produced to topic: c0t3
DEBUG:root:Using cached config for channel: kafka://example.com/bar. Time left for cache refresh: 294.33 seconds
DEBUG:root:Producing message to topic: c0t3
DEBUG:root:Parameters - value: b'Message 1: 28 | Time: 2024-08-13 07:36:47', key: None, partition: None, on_delivery: <function delivery_report at 0x7f19dcef11f0>, args: (), kwargs: {}
DEBUG:root:Message produced to topic: c0t3
DEBUG:root:Using cached config for channel: kafka://example.com/bar. Time left for cache refresh: 289.24 seconds
DEBUG:root:Producing message to topic: c0t3
DEBUG:root:Parameters - value: b'Message 2: 14 | Time: 2024-08-13 07:36:52', key: None, partition: None, on_delivery: <function delivery_report at 0x7f19dcef11f0>, args: (), kwargs: {}
DEBUG:root:Message produced to topic: c0t3
DEBUG:root:Using cached config for channel: kafka://example.com/bar. Time left for cache refresh: 284.05 seconds
DEBUG:root:Producing message to topic: c0t3
DEBUG:root:Parameters - value: b'Message 3: 18 | Time: 2024-08-13 07:36:57', key: None, partition: None, on_delivery: <function delivery_report at 0x7f19dcef11f0>, args: (), kwargs: {}
DEBUG:root:Message produced to topic: c0t3
```

The custom producer talks to the Catalog service layer through REST API and fetches the configuration details. We can see the fetched config printed bold in the logs. Using the fetched confguration, the Producer is able to publish some messages to the topic `c0t3`. Also, the producer periodically checks if the configuration cache TTL has expired or not. 

## Kafka Consumer Wrapper

Similar to the custom producer we defined above, we will create a custom consumer (`platformatory_kafka.Consumer`) to talk to Catalog service layer.

```python
import time
import requests
import logging
from urllib.parse import urlencode, quote_plus
from confluent_kafka import Consumer as ConfluentConsumer, KafkaException, KafkaError

logging.basicConfig(level=logging.DEBUG)

class Consumer:
    def __init__(self, config):
        self.service_gateway_uri = config.get('service_gateway_uri')
        self.basic_auth = config.get('basic_auth')
        self.client_id = config.get('client_id')
        self.config_profile = config.get('config_profile')
        self.ttl = config.get('ttl', 300)
        self.additional_params = config.get('additional_params', {})
        self.cache = {}
        self.cache_time = {}
        self.current_channels = []

        if not self.service_gateway_uri:
            raise ValueError("Service gateway URI must be set in the configuration")
        if not self.config_profile:
            raise ValueError("Config profile must be set in the configuration")

        self.consumer_config = None
        self.consumer = None

    def _is_cache_valid(self, key):
        return key in self.cache and (time.time() - self.cache_time[key]) < self.ttl

    def _encode_nested_params(self, params, prefix=''):
        """Encode nested query parameters."""
        encoded_params = {}
        for k, v in params.items():
            if isinstance(v, dict):
                encoded_params.update(self._encode_nested_params(v, prefix=f'{prefix}{k}.'))
            else:
                encoded_params[f'{prefix}{k}'] = v
        return encoded_params

    def _fetch_service_config(self, channels):
        channels_key = ','.join(channels)
        try:
            logging.debug(f"Fetching service config for channels: {channels}")
            query_params = {
                'config_profile': self.config_profile,
            }
            if len(channels) > 1:
                for i, channel in enumerate(channels):
                    query_params[f'channel[{i}]'] = channel
            else:
                query_params['channel'] = channels[0]

            # Encode additional parameters
            encoded_params = self._encode_nested_params(self.additional_params)
            query_params.update(encoded_params)
            query_string = urlencode(query_params, quote_via=quote_plus)
            response = requests.get(
                f"{self.service_gateway_uri}?{query_string}",
                auth=self.basic_auth
            )
            response.raise_for_status()
            new_config = response.json()
            if not self._is_cache_valid(channels_key) or new_config != self.cache.get(channels_key):
                self.cache[channels_key] = new_config
                self.cache_time[channels_key] = time.time()
                logging.debug(f"Fetched new config: {self.cache[channels_key]}")
                return True, new_config
            else:
                time_left = self.ttl - (time.time() - self.cache_time[channels_key])
                logging.debug(f"Using cached config for channels: {channels}. Time left for cache refresh: {time_left:.2f} seconds")
                return False, self.cache[channels_key]
        except requests.exceptions.RequestException as e:
            logging.error(f"Failed to fetch service config for channels {channels}: {e}")
            raise

    def _merge_config(self, config):
        merged_config = {}
        merged_config.update(config['connection'])
        merged_config.update(config['credentials'])
        merged_config.update(config['configuration'])
        merged_config['client.id'] = self.client_id
        return merged_config

    def _get_initial_config(self, channels):
        is_new_config, config = self._fetch_service_config(channels)
        initial_config = self._merge_config(config)
        return initial_config

    def subscribe(self, channels, **kwargs):
        if not channels:
            raise ValueError("At least one channel must be provided for subscription")
        
        self.current_channels = channels
        self.consumer_config = self._get_initial_config(channels)
        self.consumer = ConfluentConsumer(self.consumer_config)

        topics = self._get_topics(channels)
        logging.debug(f"Subscribing to topics: {topics}")
        self.consumer.subscribe(topics, **kwargs)

    def _get_topics(self, channels):
        _, config = self._fetch_service_config(channels)
        return [config['channel_mapping'][channel.split('/')[-1]] for channel in channels]

    def poll(self, timeout=None):
        # Check for channel mapping updates
        self._check_for_updates()
        msg = self.consumer.poll(timeout=timeout)

        # Log time remaining for cache refresh
        channels_key = ','.join(self.current_channels)
        if channels_key in self.cache_time:
            time_left = self.ttl - (time.time() - self.cache_time[channels_key])
            logging.debug(f"Time left for cache refresh: {time_left:.2f} seconds")

        if msg is None:
            logging.debug("No message received")
            return None
        if msg.error():
            if msg.error().code() == KafkaError._PARTITION_EOF:
                logging.debug("End of partition reached {0}/{1}".format(msg.topic(), msg.partition()))
                return None
            else:
                raise KafkaException(msg.error())
        logging.debug(f"Message received from topic {msg.topic()}: {msg.value().decode('utf-8')}")
        return msg

    def consume(self, num_messages=1, timeout=-1):
        # Check for channel mapping updates
        self._check_for_updates()
        msgs = self.consumer.consume(num_messages=num_messages, timeout=timeout)
        if not msgs:
            logging.debug("No messages received")
            return []
        for msg in msgs:
            logging.debug(f"Message received from topic {msg.topic()}: {msg.value().decode('utf-8')}")
        return msgs

    def _check_for_updates(self):
        channels_key = ','.join(self.current_channels)
        is_new_config, config = self._fetch_service_config(self.current_channels)
        if is_new_config:
            logging.debug("New configuration fetched, re-subscribing with new configuration")
            self.subscribe(self.current_channels)

    def close(self):
        if self.consumer:
            self.consumer.close()
```

On `subscribe` , the consumer configuration is fetched from the Catalog service and a Consumer instance is initialized. Additionally, based on the channel(s) details provides, the Consumer subscribes to the fetched topics from the Catalog service. 

On `poll` or `consume` , there is a check for any update to the configuration or topic details. If there is a change, the consumer is reinitialized with new configuration and/or subscribes to new topics. Additionally, it checks if the cache will need to refreshed according to the TTL provided. After which, it emulates the default behaviour of the method in the `confluent-kafka` library.

## Consumer App

We will create a Consumer App which utilizes the above mentioned Consumer wrapper to fetch the topics details, subscribe to the retrieved topics and consume some messages.

```python
from platformatory_kafka.consumer import Consumer, KafkaException

consumer_config = {
    'service_gateway_uri': 'http://kong:8000/servicegw',
    'basic_auth': ('user1', 'password1'),
    'client_id': 'foo',
    'config_profile': 'highThroughputConsumer',  # Config profile from user code
    'ttl': 60,  # TTL set to 5 minutes (300 seconds)
    'additional_params': {  # Additional query parameters
        'kafka': {'env': 'prod'},
        'config_profile': {'type': 'consumer', 'env': 'prod'}
    }
}

consumer = Consumer(consumer_config)

# Subscribe to multiple channels
channels = ['kafka://example.com/bar', 'kafka://example.com/baz']

# Initial subscription
consumer.subscribe(channels)

while True:
    try:
        msg = consumer.poll(1.0)
        if msg is None:
            continue
        if msg.error():
            print(f"Consumer error: {msg.error()}")
            continue

        print(f"Received message from topic {msg.topic()}: {msg.value().decode('utf-8')}")
            
    except KeyboardInterrupt:
        break
    except Exception as e:
        print(f"Error: {e}")
        break

consumer.close()
```

The configuration which will pass to the custom consumer is similar to the custom producer we previously discussed. We will pass in the channel(s) details to the `Consumer.subscribe` method. This will determine the topics the Consumer will produce to based on the Routing rule defined in the Catalog service.

### Consumer in Action

Logs of the custom consumer during execution:

```bash
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
**DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Fetched new config: {'channel_mapping': {'bar': 'c0t3', 'baz': 'c0t2'}, 'credentials': {'sasl.password': 'REDACTED', 'security.protocol': 'SASL_SSL', 'sasl.mechanisms': 'PLAIN', 'sasl.username': 'REDACTED'}, 'configuration': {'group.id': 'yourstupidpythongroup', 'fetch.min.bytes': 50000}, 'connection': {'bootstrap.servers': 'pkc-41p56.asia-south1.gcp.confluent.cloud:9092'}}
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']**
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 59.95 seconds
**DEBUG:root:Subscribing to topics: ['c0t3', 'c0t2']**
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 59.95 seconds
**DEBUG:root:Time left for cache refresh: 58.95 seconds**
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 58.93 seconds
DEBUG:root:Time left for cache refresh: 57.93 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 57.92 seconds
DEBUG:root:Time left for cache refresh: 56.92 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 56.90 seconds
DEBUG:root:Time left for cache refresh: 55.90 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 55.89 seconds
DEBUG:root:Time left for cache refresh: 54.89 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 54.87 seconds
DEBUG:root:Time left for cache refresh: 53.87 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 53.86 seconds
DEBUG:root:Time left for cache refresh: 52.86 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 52.85 seconds
DEBUG:root:Time left for cache refresh: 51.85 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 51.84 seconds
DEBUG:root:Time left for cache refresh: 50.84 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 50.82 seconds
DEBUG:root:Time left for cache refresh: 49.82 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 49.81 seconds
DEBUG:root:Time left for cache refresh: 48.81 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 48.79 seconds
DEBUG:root:Time left for cache refresh: 47.79 seconds
DEBUG:root:No message received
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 47.78 seconds
DEBUG:root:Time left for cache refresh: 47.19 seconds
**DEBUG:root:Message received from topic c0t3: Message 23: 34 | Time: 2024-08-13 07:38:39**
DEBUG:root:Fetching service config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']
DEBUG:urllib3.connectionpool:Starting new HTTP connection (1): kong:8000
DEBUG:urllib3.connectionpool:http://kong:8000 "GET /servicegw?config_profile=highThroughputConsumer&channel%5B0%5D=kafka%3A%2F%2Fexample.com%2Fbar&channel%5B1%5D=kafka%3A%2F%2Fexample.com%2Fbaz&kafka.env=prod&config_profile.type=consumer&config_profile.env=prod HTTP/11" 200 400
DEBUG:root:Using cached config for channels: ['kafka://example.com/bar', 'kafka://example.com/baz']. Time left for cache refresh: 47.18 seconds
DEBUG:root:Time left for cache refresh: 46.18 seconds
DEBUG:root:No message received
```

Similar to the custom producer, the custom consumer talks to the Catalog service through REST API and fetches the configurations for the Consumer client and the required topics based on the channel provided. It then subscribes to the fetched topics and starts consuming messages. It also periodically checks the cache TTL for the configuration refresh.

# Conclusion

In this blog post, we covered the Python implementation for the custom client SDK to talk to the Rule Based Routing Layer to dynamically fetch the topic details and client configuration. We talked through the considerations and the nuances in the implementation. As next steps, we will package this implementation as a Python library to enable users to implement it with ease.