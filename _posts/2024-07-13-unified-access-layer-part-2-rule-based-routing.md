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

This is the Part 2 which is a follow up of [Part 1](https://platformatory.io/blog/unified-access-layer-kafka-resources-part-1) of the Unified Access Layer for Kafka Resources where we dive deep into the design and implementation of discovering Kafka resources via a rule based routing layer.

# Approach 1: Discover topics through a rule based routing layer

Just to recap, here we are trying to build the pattern where a language specific SDK handles the Kafka resources discovery by talking to a catalog service.

Let’s refer the overall architecture diagram:
<div id="rbs" class="mermaid">
flowchart LR

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

 subgraph GW["Rule Based Routing Layer"]
    direction LR
        API["APIs (Kong)"]
        US["Upstream (Catalog Service)"]
  end
 subgraph K1["Kafka Cluster 1"]
        B1["Broker 1"]
        B2["Broker 2"]
        B3["Broker 3"]
  end
subgraph K2["Kafka Cluster 2"]
        B4["Broker 1"]
        B5["Broker 2"]
        B6["Broker 3"]
  end


    P1 & P2 & P3 -- 1.GetInfo --> GW -- 2.Response --> P1 & P2 & P3
    CG1 & CG2 & CG3  -- 1.GetInfo --> GW -- 2.Response --> CG1 & CG2 & CG3
    P1 -- 3.Produces --> K1
    P2 -- 3.Produces --> K2
    P3 -- 3.Produces --> CC
    API --> US
    K1 -- 4.Consumes --> CG1
    K2 -- 4.Consumes --> CG2
    CC -- 4.Consumes --> CG3

    %% Styling
    classDef kafkaStyle fill:#e0f7e9,stroke:#4caf50,stroke-width:2px;
    class K1,K2 kafkaStyle;
</div>

## Implementation

### Catalog Service

This represents the catalog of all the Kafka resources that are needed by Clients (Producers and Consumers). This is implemented in the Kong API Gateway with 
- A service that represents the Catalog Service upstream
- A route “/kafka-service-gw” on the service
- A custom plugin (or a pre-functions/post-functions plugin) that has a set of rules configured to retrieve the right Kafka bootstrap servers and topic information based on a set of query parameters (Channel, ServiceType, Organization). Clients can be either 1 call (ideally) or multiple calls to retrieve the information.
- Auth: all these calls are protected using Basic Auth

The code can be found [here](https://github.com/Platformatory/kong-service-gateway)

### Java Implementation for Kafka Producer and Consumer

### Kafka Producer
Like we highlighted above, we need a custom consumer that can call the Catalog Service passing in the required information to locate the bootstrap servers and the topic. These will then be used to produce records (instead of the static configuration of the bootstrap servers and the topic). Here, we create a new ServiceLocatorProduder which is a facade around the KafkaProduder (routes all the calls to the internal Kafka Producer object). It first calls the Catalog Service passing the information needed and obtains the bootstrap servers and the kafka topic.

As you can see below, any configuration change during the `send` will trigger an automatic refresh of the bootstrap servers and the topic. After this, everything will work seamlessly as you can see the execution.

```java
class BasicInterceptor implements Interceptor {
    String credentials;
    BasicInterceptor(String id, String password) {
        credentials = Credentials.basic(id, password);
    }

    @NotNull
    @Override
    public Response intercept(@NotNull Chain chain) throws IOException {
        Request request = chain.request();
        Request.Builder builder = request.newBuilder().header("Authorization", credentials);
        return chain.proceed(builder.build());
    }
}
public class ServiceLocatorProducer<K,V> implements Producer {
    private OkHttpClient client = new OkHttpClient.Builder().build();
    private LoadingCache<String, Map<String, String>> cache;
    public static final String CACHE_KEY = "service-map";
    public static final String KAFKA_TOPIC_KEY = "kafka_topic";
    public static final String SERVICE_LOCATOR_BASE_URL = "http://localhost:8000/kafka-service-gw/";
    private Properties properties;

    private KafkaProducer kafkaProducer;

    private void initCache() throws ExecutionException {
        cache = CacheBuilder.newBuilder()
            .maximumSize(10)
            .expireAfterWrite(5, TimeUnit.SECONDS)
            .build(
                    new CacheLoader<String, Map<String, String>>() {
                        public Map<String, String> load(String id) throws IOException {
                        final Map<String, String>  svcMap = getServiceConfiguration();
                        return svcMap;
                        }
                    }
            );
    }

    private void createProducer(Properties properties) throws ExecutionException {
        properties.put(BOOTSTRAP_SERVERS_CONFIG, cache.get(CACHE_KEY).get(BOOTSTRAP_SERVERS_CONFIG));

        System.out.println(cache.get(CACHE_KEY).get(BOOTSTRAP_SERVERS_CONFIG));

        this.properties = properties;

        kafkaProducer = new KafkaProducer(properties);
    }

    ServiceLocatorProducer(Properties properties) throws ExecutionException {
        initCache();

        createProducer(properties);
    }

    String getTopic() throws ExecutionException {
        return cache.get(CACHE_KEY).get(KAFKA_TOPIC_KEY);
    }

    public Map<String,String> getServiceConfiguration() throws IOException {
        OkHttpClient client = new OkHttpClient.Builder()
                .callTimeout(5, TimeUnit.MINUTES)
                .connectTimeout(5, TimeUnit.MINUTES)
                .addInterceptor(new BasicInterceptor("user1", "password1"))
                .build();

        Map<String, String> kafkaSvcLocMap = new HashMap<>();

        String topic = getTopicConfiguraion(client);
        kafkaSvcLocMap.put(KAFKA_TOPIC_KEY, topic);

        String bootstrapServersConfig = getBootstrapServersConfig(client);

        kafkaSvcLocMap.put(BOOTSTRAP_SERVERS_CONFIG, bootstrapServersConfig);

        return kafkaSvcLocMap;
    }

    @NotNull
    private String getBootstrapServersConfig(OkHttpClient client) throws IOException {
        Request request = new Request.Builder()
                .url(SERVICE_LOCATOR_BASE_URL + "kafka_clusters?domain=example.org")
                .build();

        Response response = client.newCall(request).execute();
        if (!response.isSuccessful()) throw new IOException("Unexpected code " + response);

        JsonObject jsonObject = JsonParser.parseString(response.body().string()).getAsJsonObject();
        System.out.println("bootstrap:" + jsonObject.get("bootstrap_servers").getAsString());
        return jsonObject.get("bootstrap_servers").getAsString();
    }

    @NotNull
    private String getTopicConfiguraion(OkHttpClient client) throws IOException {
        Request request = new Request.Builder()
                .url(SERVICE_LOCATOR_BASE_URL + "channels?channel_name=channel1")
                .build();

        Response response = client.newCall(request).execute();
        if (!response.isSuccessful()) throw new IOException("Unexpected code " + response);

        JsonObject jsonObject = JsonParser.parseString(response.body().string()).getAsJsonObject();
        System.out.println(jsonObject.get("resolved_value").getAsString());
        JsonObject innerObject = JsonParser.parseString(jsonObject.get("resolved_value").getAsString()).getAsJsonObject();
        System.out.println(innerObject.get("topic1"));
        return innerObject.get("topic1").getAsString();
    }

    @Override
    public Future<RecordMetadata> send(ProducerRecord producerRecord) {
        return send(producerRecord, null);
    }

    @Override
    public Future<RecordMetadata> send(ProducerRecord producerRecord, Callback callback) {
        String bootstrapServers = null;
        String topic = null;
        try {
            bootstrapServers = cache.get(CACHE_KEY).get(BOOTSTRAP_SERVERS_CONFIG);
            topic = cache.get(CACHE_KEY).get(KAFKA_TOPIC_KEY);
        } catch (ExecutionException e) {
            throw new RuntimeException(e);
        }

        if (this.properties.get(BOOTSTRAP_SERVERS_CONFIG).equals(bootstrapServers) &&
                producerRecord.topic().equals(topic)) {
            return kafkaProducer.send(producerRecord, callback);
        } else {
            System.out.printf(
                    "Need to update bootstrap servers config to %s and the topic config to %s and create a new Producer\n", bootstrapServers, topic);
            this.close();
            properties.put(BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
            kafkaProducer = new KafkaProducer(properties);
            ProducerRecord newRecord = new ProducerRecord<>(topic, producerRecord.key(), producerRecord.value());
            return kafkaProducer.send(newRecord, callback);
        }
    }
```

### Kafka Producer App

Typically, the producer application would include all the properties needed to successfully publish records to the Kafka cluster (especially the 2 key things: 1/ Bootstrap servers, 2/ Topic). Like shown below, the ServiceLocatorProducer does the magic to get the right bootstrap servers and topic (instead of the commented out static information).

```java
public class App {

    public static void main(String[] args ) throws Exception, ExecutionException, InterruptedException {

        Properties config = new Properties();

        // Not adding the bootstrap.servers config because it will be retrieved automatically
        config.put(ACKS_CONFIG, "all");
        config.put(KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getCanonicalName());
        config.put(VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getCanonicalName());

        String [] keys = {"joe", "jill", "justie"};
        String [] values = {"crease", "myers", "hill"};

        try (final ServiceLocatorProducer<String, String> producer = new ServiceLocatorProducer<>(config)) {
            final Random rnd = new Random();
            final int numMessages = 10000;
            for (int i = 0; i < numMessages; i++) {
                String user = keys[rnd.nextInt(keys.length)];
                String item = values[rnd.nextInt(values.length)];

                // topic is obtained automatically from the producer and updated if it is different
                // when we receive the topic from the RecordMetadata received from the send method
                AtomicReference<String> topic = new AtomicReference<>(producer.getTopic());

                producer.send(
                        new ProducerRecord<>(topic.get(), user, item),
                        (event, ex) -> {
                            if (ex != null)
                                ex.printStackTrace();
                            else {
                                System.out.printf("Produced event to topic %s: key = %-10s value = %s%n", topic, user, item);
                                if (!topic.get().equals(event.topic())) {
                                    topic.set(event.topic());
                                }
                            }
                        });
                // Only to demonstrate the change in configurations
                Thread.sleep(100);
            }

            System.out.printf("%s events were produced to topic %s%n", numMessages, producer.getTopic());

        }
    }
}

```

### Kafka Producer in Action
Just showing the excerpts from the full execution here.

```
C:\Users\nragh\.jdks\corretto-11.0.22\bin\java.exe "-javaagent:C:\Program Files\JetBrains\IntelliJ IDEA Community Edition 2023.2.2\lib\idea_rt.jar=55727:C:\Program Files\JetBrains\IntelliJ IDEA Community Edition 2023.2.2\bin" -Dfile.encoding=UTF-8 -classpath C:\Users\nragh\IdeaProjects\kafka-producer\target\classes;C:\Users\nragh\.m2\repository\org\apache\kafka\kafka-clients\7.0.1-ccs\kafka-clients-7.0.1-ccs.jar;C:\Users\nragh\.m2\repository\com\github\luben\zstd-jni\1.5.0-2\zstd-jni-1.5.0-2.jar;C:\Users\nragh\.m2\repository\org\lz4\lz4-java\1.7.1\lz4-java-1.7.1.jar;C:\Users\nragh\.m2\repository\org\xerial\snappy\snappy-java\1.1.8.1\snappy-java-1.1.8.1.jar;C:\Users\nragh\.m2\repository\org\slf4j\slf4j-api\1.7.30\slf4j-api-1.7.30.jar;C:\Users\nragh\.m2\repository\org\apache\commons\commons-lang3\3.14.0\commons-lang3-3.14.0.jar;C:\Users\nragh\.m2\repository\com\squareup\okhttp3\okhttp\4.12.0\okhttp-4.12.0.jar;C:\Users\nragh\.m2\repository\com\squareup\okio\okio\3.6.0\okio-3.6.0.jar;C:\Users\nragh\.m2\repository\com\squareup\okio\okio-jvm\3.6.0\okio-jvm-3.6.0.jar;C:\Users\nragh\.m2\repository\org\jetbrains\kotlin\kotlin-stdlib-common\1.9.10\kotlin-stdlib-common-1.9.10.jar;C:\Users\nragh\.m2\repository\org\jetbrains\kotlin\kotlin-stdlib-jdk8\1.8.21\kotlin-stdlib-jdk8-1.8.21.jar;C:\Users\nragh\.m2\repository\org\jetbrains\kotlin\kotlin-stdlib\1.8.21\kotlin-stdlib-1.8.21.jar;C:\Users\nragh\.m2\repository\org\jetbrains\annotations\13.0\annotations-13.0.jar;C:\Users\nragh\.m2\repository\org\jetbrains\kotlin\kotlin-stdlib-jdk7\1.8.21\kotlin-stdlib-jdk7-1.8.21.jar;C:\Users\nragh\.m2\repository\com\google\guava\guava\33.2.1-jre\guava-33.2.1-jre.jar;C:\Users\nragh\.m2\repository\com\google\guava\failureaccess\1.0.2\failureaccess-1.0.2.jar;C:\Users\nragh\.m2\repository\com\google\guava\listenablefuture\9999.0-empty-to-avoid-conflict-with-guava\listenablefuture-9999.0-empty-to-avoid-conflict-with-guava.jar;C:\Users\nragh\.m2\repository\com\google\code\findbugs\jsr305\3.0.2\jsr305-3.0.2.jar;C:\Users\nragh\.m2\repository\org\checkerframework\checker-qual\3.42.0\checker-qual-3.42.0.jar;C:\Users\nragh\.m2\repository\com\google\errorprone\error_prone_annotations\2.26.1\error_prone_annotations-2.26.1.jar;C:\Users\nragh\.m2\repository\com\google\j2objc\j2objc-annotations\3.0.0\j2objc-annotations-3.0.0.jar;C:\Users\nragh\.m2\repository\com\google\code\gson\gson\2.11.0\gson-2.11.0.jar com.platformatory.App
{"topic1": "users", "topic2": "users-1"}
"users"
bootstrap:localhost:9092,localhost:9093,localhost:9094
localhost:9092,localhost:9093,localhost:9094
SLF4J: Failed to load class "org.slf4j.impl.StaticLoggerBinder".
SLF4J: Defaulting to no-operation (NOP) logger implementation
SLF4J: See http://www.slf4j.org/codes.html#StaticLoggerBinder for further details.
Produced event to topic users: key = joe        value = myers
Produced event to topic users: key = joe        value = crease
Produced event to topic users: key = justie     value = myers
Produced event to topic users: key = jill       value = hill
Produced event to topic users: key = jill       value = hill
Produced event to topic users: key = joe        value = hill
Produced event to topic users: key = justie     value = hill
Produced event to topic users: key = justie     value = crease
Produced event to topic users: key = joe        value = myers
...
bootstrap:localhost:9092,localhost:9093
Need to update bootstrap servers config to {localhost:9092,localhost:9093} and the topic config to {users-1} and create a new Producer
Produced event to topic users-1: key = joe        value = crease
Produced event to topic users-1: key = justie     value = crease
Produced event to topic users-1: key = joe        value = myers
Produced event to topic users-1: key = justie     value = crease
Produced event to topic users-1: key = justie     value = myers
Produced event to topic users-1: key = jill       value = hill
Produced event to topic users-1: key = justie     value = hill
Produced event to topic users-1: key = joe        value = hill
Produced event to topic users-1: key = jill       value = myers
Produced event to topic users-1: key = justie     value = hill
Produced event to topic users-1: key = jill       value = hill
Produced event to topic users-1: key = joe        value = hill
...

```

### Kafka Consumer
Just like the facade created by the Kafka Producer, we do the same here called the ServiceLocatorConsumer, which routes all the calls to the internal Kafka Consumer object. Also, just like the ServiceLocatorProducer, it calls the Catalog Service and obtains the same 2 key properties needed to consume data.

```java
class BasicInterceptor implements Interceptor {
    String credentials;
    BasicInterceptor(String id, String password) {
        credentials = Credentials.basic(id, password);
    }

    @NotNull
    @Override
    public Response intercept(@NotNull Chain chain) throws IOException {
        Request request = chain.request();
        Request.Builder builder = request.newBuilder().header("Authorization", credentials);
        return chain.proceed(builder.build());
    }
}

public class ServiceLocatorConsumer<K, V> implements Consumer<K, V> {
    private OkHttpClient client;
    private LoadingCache<String, Map<String, String>> cache;
    public static final String CACHE_KEY = "service-map";
    public static final String KAFKA_TOPIC_KEY = "kafka_topic";
    public static final String SERVICE_LOCATOR_BASE_URL = "http://localhost:8000/kafka-service-gw/";
    private Properties properties;
    private KafkaConsumer kafkaConsumer;

    public ServiceLocatorConsumer(Map<String, Object> configs) {
        kafkaConsumer = new KafkaConsumer<>(configs);
    }

    private void initCache() throws ExecutionException {
        cache = CacheBuilder.newBuilder()
                .maximumSize(100)
                .expireAfterWrite(5, TimeUnit.SECONDS)
                .build(
                        new CacheLoader<String, Map<String, String>>() {
                            public Map<String, String> load(String id) throws IOException {
                                final Map<String, String>  svcMap = getServiceConfiguration();
                                return svcMap;
                            }
                        }
                );
    }
    private void createConsumer(Properties properties) throws ExecutionException {
        properties.put(BOOTSTRAP_SERVERS_CONFIG, cache.get(CACHE_KEY).get(BOOTSTRAP_SERVERS_CONFIG));
        System.out.println(cache.get(CACHE_KEY).get(BOOTSTRAP_SERVERS_CONFIG));

        this.properties = properties;

        kafkaConsumer = new KafkaConsumer<>(properties);
    }

    public ServiceLocatorConsumer(Properties properties) throws ExecutionException {
        client = new OkHttpClient.Builder().build();

        initCache();

        createConsumer(properties);
    }

    public Map<String,String> getServiceConfiguration() throws IOException {
        OkHttpClient client = new OkHttpClient.Builder()
                .callTimeout(5, TimeUnit.MINUTES)
                .connectTimeout(5, TimeUnit.MINUTES)
                .addInterceptor(new BasicInterceptor("user1", "password1"))
                .build();

        Map<String, String> kafkaSvcLocMap = new HashMap<>();

        String topic = getTopicConfiguraion(client);
        kafkaSvcLocMap.put(KAFKA_TOPIC_KEY, topic);

        String bootstrapServersConfig = getBootstrapServersConfig(client);

        kafkaSvcLocMap.put(BOOTSTRAP_SERVERS_CONFIG, bootstrapServersConfig);

        return kafkaSvcLocMap;
    }

    @NotNull
    private String getBootstrapServersConfig(OkHttpClient client) throws IOException {
        Request request = new Request.Builder()
                .url(SERVICE_LOCATOR_BASE_URL + "kafka_clusters?domain=example.org")
                .build();

        Response response = client.newCall(request).execute();
        if (!response.isSuccessful()) throw new IOException("Unexpected code " + response);

        JsonObject jsonObject = JsonParser.parseString(response.body().string()).getAsJsonObject();
        System.out.println("bootstrap:" + jsonObject.get("bootstrap_servers").getAsString());
        return jsonObject.get("bootstrap_servers").getAsString();
    }

    @NotNull
    private String getTopicConfiguraion(OkHttpClient client) throws IOException {
        Request request = new Request.Builder()
                .url(SERVICE_LOCATOR_BASE_URL + "channels?channel_name=channel1")
                .build();

        Response response = client.newCall(request).execute();
        if (!response.isSuccessful()) throw new IOException("Unexpected code " + response);

        JsonObject jsonObject = JsonParser.parseString(response.body().string()).getAsJsonObject();
        System.out.println(jsonObject.get("resolved_value").getAsString());
        JsonObject innerObject = JsonParser.parseString(jsonObject.get("resolved_value").getAsString()).getAsJsonObject();
        System.out.println(innerObject.get("topic1"));
        return innerObject.get("topic1").getAsString();
    }

    @Override
    public ConsumerRecords<K, V> poll(long l) {
        return kafkaConsumer.poll(l);
    }

    @Override
    public ConsumerRecords<K, V> poll(Duration duration) {
        String bootstrapServers = null;
        String topic = null;
        try {
            bootstrapServers = cache.get(CACHE_KEY).get(BOOTSTRAP_SERVERS_CONFIG);
            topic = cache.get(CACHE_KEY).get(KAFKA_TOPIC_KEY);
        } catch (ExecutionException e) {
            throw new RuntimeException(e);
        }

        if (!this.properties.get(BOOTSTRAP_SERVERS_CONFIG).equals(bootstrapServers) ||
                !this.listTopics().containsKey(topic)) {
            System.out.printf(
                    "Need to update bootstrap servers config to %s from %s and create a new Consumer\n", bootstrapServers, properties.get(BOOTSTRAP_SERVERS_CONFIG));
            properties.put(BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);

            this.unsubscribe();

            this.close();

            kafkaConsumer = new KafkaConsumer<>(properties);

            kafkaConsumer.subscribe(Arrays.asList(topic));

        }
        return kafkaConsumer.poll(duration);
    }

```

### Kafka Consumer App
Just like the Kafka Producer App, the Consumer App instantiates the ServiceLocatorConsumer and seamlessly starts consuming from the obtained topic. You can see how the commented out code for the bootstrap servers and the topic show the dynamic nature of the whole system. Also notice that if a configuration change happens during the poll, we automatically refresh the bootstrap servers or the topic configuration and take care of: 1/ updating the bootstrap servers, 2/ on a topic change, we unsubscribe to the previous topics, close the consumer, create a new consumer and subscribe to the new topic(s). Post this, everything gets back to normal.

```java
public class App
{
    public static void main( String[] args ) throws ExecutionException, InterruptedException {
        Properties config = new Properties();
        try {
            config.put("client.id", InetAddress.getLocalHost().getHostName());
        } catch (UnknownHostException e) {
            throw new RuntimeException(e);
        }

        // Not adding the bootstrap.servers config because it will be retrieved automatically
        config.put(AUTO_OFFSET_RESET_CONFIG, "earliest");
        config.put(GROUP_ID_CONFIG, "kafka-java-consumer");
        config.put(KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getCanonicalName());
        config.put(VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getCanonicalName());

        // topic is obtained automatically from the producer and updated if it is different
        // when we receive the topic from the ConsumerRecord received from the poll method

        try (final ServiceLocatorConsumer consumer = new ServiceLocatorConsumer<>(config)) {
            consumer.subscribe(Arrays.asList(consumer.getTopic()));
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
                for (ConsumerRecord<String, String> record : records) {
                    String key = record.key();
                    String value = record.value();
                    String topic = record.topic();
                    System.out.println(
                            String.format("Consumed event from topic %s: key = %-10s value = %s", topic, key, value));
                }
            }
        }
    }
}

```

### Kafka Consumer in Action
```
C:\Users\nragh\.jdks\corretto-11.0.22\bin\java.exe "-javaagent:C:\Program Files\JetBrains\IntelliJ IDEA Community Edition 2023.2.2\lib\idea_rt.jar=55738:C:\Program Files\JetBrains\IntelliJ IDEA Community Edition 2023.2.2\bin" -Dfile.encoding=UTF-8 -classpath C:\Users\nragh\IdeaProjects\kakfa-consumer\target\classes;C:\Users\nragh\.m2\repository\org\apache\kafka\kafka-clients\7.6.1-ce\kafka-clients-7.6.1-ce.jar;C:\Users\nragh\.m2\repository\io\confluent\telemetry-events-api\7.6.1-ce\telemetry-events-api-7.6.1-ce.jar;C:\Users\nragh\.m2\repository\com\github\luben\zstd-jni\1.5.5-1\zstd-jni-1.5.5-1.jar;C:\Users\nragh\.m2\repository\org\lz4\lz4-java\1.8.0\lz4-java-1.8.0.jar;C:\Users\nragh\.m2\repository\org\xerial\snappy\snappy-java\1.1.10.5\snappy-java-1.1.10.5.jar;C:\Users\nragh\.m2\repository\org\slf4j\slf4j-api\1.7.36\slf4j-api-1.7.36.jar;C:\Users\nragh\.m2\repository\com\fasterxml\jackson\core\jackson-databind\2.11.0\jackson-databind-2.11.0.jar;C:\Users\nragh\.m2\repository\com\fasterxml\jackson\core\jackson-annotations\2.11.0\jackson-annotations-2.11.0.jar;C:\Users\nragh\.m2\repository\com\fasterxml\jackson\core\jackson-core\2.11.0\jackson-core-2.11.0.jar;C:\Users\nragh\.m2\repository\org\apache\commons\commons-lang3\3.14.0\commons-lang3-3.14.0.jar;C:\Users\nragh\.m2\repository\com\squareup\okhttp3\okhttp\4.12.0\okhttp-4.12.0.jar;C:\Users\nragh\.m2\repository\com\squareup\okio\okio\3.6.0\okio-3.6.0.jar;C:\Users\nragh\.m2\repository\com\squareup\okio\okio-jvm\3.6.0\okio-jvm-3.6.0.jar;C:\Users\nragh\.m2\repository\org\jetbrains\kotlin\kotlin-stdlib-common\1.9.10\kotlin-stdlib-common-1.9.10.jar;C:\Users\nragh\.m2\repository\org\jetbrains\kotlin\kotlin-stdlib-jdk8\1.8.21\kotlin-stdlib-jdk8-1.8.21.jar;C:\Users\nragh\.m2\repository\org\jetbrains\kotlin\kotlin-stdlib\1.8.21\kotlin-stdlib-1.8.21.jar;C:\Users\nragh\.m2\repository\org\jetbrains\annotations\13.0\annotations-13.0.jar;C:\Users\nragh\.m2\repository\org\jetbrains\kotlin\kotlin-stdlib-jdk7\1.8.21\kotlin-stdlib-jdk7-1.8.21.jar;C:\Users\nragh\.m2\repository\com\google\guava\guava\33.2.1-jre\guava-33.2.1-jre.jar;C:\Users\nragh\.m2\repository\com\google\guava\failureaccess\1.0.2\failureaccess-1.0.2.jar;C:\Users\nragh\.m2\repository\com\google\guava\listenablefuture\9999.0-empty-to-avoid-conflict-with-guava\listenablefuture-9999.0-empty-to-avoid-conflict-with-guava.jar;C:\Users\nragh\.m2\repository\com\google\code\findbugs\jsr305\3.0.2\jsr305-3.0.2.jar;C:\Users\nragh\.m2\repository\org\checkerframework\checker-qual\3.42.0\checker-qual-3.42.0.jar;C:\Users\nragh\.m2\repository\com\google\errorprone\error_prone_annotations\2.26.1\error_prone_annotations-2.26.1.jar;C:\Users\nragh\.m2\repository\com\google\j2objc\j2objc-annotations\3.0.0\j2objc-annotations-3.0.0.jar;C:\Users\nragh\.m2\repository\com\google\code\gson\gson\2.11.0\gson-2.11.0.jar com.platformatory.App
{"topic1": "users", "topic2": "users-1"}
"users"
bootstrap:localhost:9092,localhost:9093,localhost:9094
localhost:9092,localhost:9093,localhost:9094
SLF4J: Failed to load class "org.slf4j.impl.StaticLoggerBinder".
SLF4J: Defaulting to no-operation (NOP) logger implementation
SLF4J: See http://www.slf4j.org/codes.html#StaticLoggerBinder for further details.
Consumed event from topic users: key = justie     value = myers
Consumed event from topic users: key = justie     value = crease
Consumed event from topic users: key = justie     value = crease
Consumed event from topic users: key = justie     value = crease
Consumed event from topic users: key = justie     value = crease
Consumed event from topic users: key = justie     value = hill
Consumed event from topic users: key = justie     value = myers
Consumed event from topic users: key = justie     value = myers
...
bootstrap:localhost:9092,localhost:9093
Need to update bootstrap servers config to {localhost:9092,localhost:9093} from {localhost:9092,localhost:9093,localhost:9094} and create a new Consumer
Consumed event from topic users-1: key = joe        value = crease
Consumed event from topic users-1: key = joe        value = myers
Consumed event from topic users-1: key = joe        value = hill
Consumed event from topic users-1: key = joe        value = hill
Consumed event from topic users-1: key = joe        value = hill
Consumed event from topic users-1: key = joe        value = myers
Consumed event from topic users-1: key = justie     value = crease
Consumed event from topic users-1: key = justie     value = crease
Consumed event from topic users-1: key = justie     value = myers
Consumed event from topic users-1: key = justie     value = hill
Consumed event from topic users-1: key = justie     value = hill
...

```

## Python Implementation
Coming soon...


# Conclusion

Creating a system that helps a centralized Kafka infrastructure team to easily create, label and vend information reduces common problems and dependencies. Same benefits are passed on to the producers and consumers thus creating a scalable system/organization. 
