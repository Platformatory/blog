---
layout: post
title:  "End to End data flow pipeline using Confluent Kafka Connect and ksqlDB"
author: Srikanth Pai
categories: [ Data Engineering, Confluent Kafka, Kafka Connect, Confluent ksqlDB ]
image: assets/blog-images/sp_blogs/ksql_connect_demo/intro.jpg
featured: true
hidden: true
---

## End to End data flow pipeline using Confluent Kafka Connect and ksqlDB

A data pipeline is nothing but a chain or series of data processing steps. It starts off with ingestion of the data into the system, following which there are a series of steps, in which each step delivers its output as an input to the next step in the process. This continues until the pipeline is complete.


Traditionally, data processing pipelines have been built on batch processes. Batch processing is usually run on a schedule and carried out on large datasets. It works well in situations where you don’t need real-time analytics results, and when it is more important to process large volumes of information than it is to get fast analytics results. Therefore, they are not suited for real-time processing use-cases, such as in the context of IoT data or Fraud detection in the banking domain. Batch systems typically fall under the umbrella of ETL(Extract-Transform-Load) or ELT(Extract-Load_transform) process.


Stream processing is key if you want analytics results in real time. By building data streams, you can feed data into analytics tools as soon as it is generated and get near-instant analytics results using platforms like Apache Spark Streaming, Flink, Storm, Pulsar and many more.


Data streaming is now becoming the “secret sauce” of helping businesses to remain competitive within their market through real-time insights. One reason for this is, you can obtain results faster and react to problems or opportunities before you lose the ability to leverage results from them.


In this blogpost, we will take on a hypothetical IoT use-case which collects and aggregates electric power consumption data.


Let us consider we have a file containing the data, somewhere in a database table and want to perform some calculations on this data for regular time windows and subsequently dump these computed values back into a database table. For the purpose of this experiment I will be using an open source electric power consumption dataset, available on Kaggle. 
This dataset contains measurements of electric power consumption in one household with a one-minute sampling rate over a period of time.


Let’s say we want to analyze the user’s power consumption habits for every hour or every 30 minutes. This could give us a lot of insights about the user’s electric appliance usage activity.

![]({{ site.baseurl }}/assets/blog-images/sp_blogs/ksql_connect_demo/intro2.png)


We will be building an end to end pipeline on top of Confluent's fully managed Connectors and KSQL DB as the stream processing database.
Firstly, we need to do two things:



### Get data into Kafka
For this, one could assume that the IoT devices themselves write to Kafka; However, this maybe error prone or even inefficient over a network; In a practical scenario, this may be written to a local database in an IoT hub or aggregated to a more central location, like a Data Warehouse or a Data Lake.
In any case, such data must be sourced: That is, pulled into Kafka. Kafka Connect provides a framework for "pull-based" ingestion of data into Kafka from various heterogeneous sources, along with declarative control on parallel ingestion.It further, also has the concept of SMTs [Single Message Transform] - which enable small and simple transforms to be embedded directly into the connect pipeline.

### Process data in Kafka

Processing data in Kafka is a little inaccurate since Kafka is chiefly a distributed, partitioned commit-log. It has no built-in features to "process" data, which basically means that it must be done external to the brokers, utilizing the producer consumer primitives. Currently, there are many such stream processing frameworks in the market.
Stream processing applications such as Apache Flink can handle sourcing and sinking, alongside several operators that can enable temporal (windowing) processing, ordering/delivery guarantees and so on.
Kafka Streams in contrast is a stream processing framework that is more of a library and uses underlying Kafka producers and consumers to do work, organized in processor topologies.
Both options are code heavy and come with a steep learning curve.
In contrast, KSQL provides a SQL-like grammar to do all kinds of processing and thus is immediately familiar to anyone who is conversant with SQL (albeit some nuances along the way). KSQL is built on top of KStreams and can be thought of as a higher order  facade to KStreams capabilities (except it is expressed as plain SQL instead of Java or Scala code).


The end to end data pipeline that we’ll be looking at will in real-time, ingest, process and sink records into a PostgreSQL Database by using :
1. Confluent Kafka Connect for ingesting the records from a table in a postgreSQL database; and to export it back to a new table in the database table.
2. Confluent KSQL to process the data that was ingested, that is, perform aggregations on the ingested records. We shall be performing windowed aggregations for 1 hour and 5 minute intervals, upon the electric power consumption dataset.

![]({{ site.baseurl }}/assets/blog-images/sp_blogs/ksql_connect_demo/Flowchart.png)


Let’s take a look at our input data. The data can be hosted anywhere, ours is hosted on a DigitalOcean server.

![]({{ site.baseurl }}/assets/blog-images/sp_blogs/ksql_connect_demo/po_input.png)

We’re only looking at the time series voltage data. An additional id column is synthetically added to this dataset. This is nothing but the hour extracted from the timestamp [ date_time column ]. Through the Confluent Dashboard, a Source connector is created to read from this postgres table. It created a topic in Confluent Kafka.
Next we create a ksqlDB cluster, to calculate the hourly and 5 minute aggregations. The queries to create the Stream and Tables in KsqlDB are as follows:


```
CREATE STREAM VOLTAGE_STREAM WITH (KAFKA_TOPIC='kafka_topic_voltages', PARTITIONS=1, TIMESTAMP='date_time', VALUE_FORMAT='AVRO');
```

An initial stream is created in ksqlDB, that reads from the topic created by the source connector.
There are three ways to define time windows in ksqlDB: hopping windows, tumbling windows, and session windows. Hopping and tumbling windows are time windows, because they are defined by fixed durations that you specify. Session windows are dynamically sized based on incoming data and defined by periods of activity separated by gaps of inactivity.


For the purpose of calculating the windowed averages we shall be dealing with Tumbling windows.

Tumbling windows are fixed-size, non-overlapping, gap-less windows. It is defined by a single property: the window’s duration. A tumbling window is a hopping window whose window duration is equal to its advance interval. Since tumbling windows never overlap, a record will belong to one and only one window.


All tumbling windows are the same size and adjacent to each other, which means that whenever a window ends, the next window starts.
The windowstart and windowend are keywords that are in the unix time format. We use Scalar functions to convert these back into Timestamp format.


* FROM_UNIXTIME - Converts a bigint epoch timestamp in milliseconds to a timestamp value.
* FORMAT_TIMESTAMP - Converts a Timestamp value into a string representation in the specified format.

To calculate the average voltage for every hour, the query is as follows:
```
CREATE TABLE VOLTAGE_AVERAGE_HOURLY WITH (KAFKA_TOPIC='kafka_topic_voltage_average_hourly', PARTITIONS=1, REPLICAS=3, VALUE_FORMAT='AVRO') AS SELECT
 ID,
 FORMAT_TIMESTAMP(FROM_UNIXTIME(WINDOWSTART), 'yyyy-MM-dd HH:mm:ss') AS START_TIME,
 FORMAT_TIMESTAMP(FROM_UNIXTIME(WINDOWEND), 'yyyy-MM-dd HH:mm:ss') AS END_TIME,
 AVG(VOLTAGE) AS AVERAGE_VOLTAGE
FROM VOLTAGE_STREAM
WINDOW TUMBLING ( SIZE 1 HOURS )
GROUP BY ID
EMIT CHANGES;
```

To calculate the average voltages for every 5 minute window, our query will look like this..

```
CREATE TABLE VOLTAGE_AVERAGE_FIVE_MINUTE WITH (KAFKA_TOPIC='kafka_topic_voltage_average_five_minute', PARTITIONS=1, REPLICAS=3, VALUE_FORMAT='AVRO') AS SELECT
 ID,
 FORMAT_TIMESTAMP(FROM_UNIXTIME(WINDOWSTART), 'yyyy-MM-dd HH:mm:ss') AS START_TIME,
 FORMAT_TIMESTAMP(FROM_UNIXTIME(WINDOWEND), 'yyyy-MM-dd HH:mm:ss') AS END_TIME,
 AVG(VOLTAGE) AS AVERAGE_VOLTAGE
FROM VOLTAGE_STREAM
WINDOW TUMBLING ( SIZE 5 MINUTES )
GROUP BY ID
EMIT CHANGES;
```

Post creation of these tables, we end up with two new topics -
* kafka_topic_voltage_average_hourly
* kafka_topic_voltage_average_five_minute


Sink connectors are created on top of these topics to export the calculated values into our postgres database.

We also use TimestampConverter Single message transform to transform outbound messages before they are sent to a sink connector.
The configuration snippet shows how to use Timestamp to transform out string fields (START_TIME and END_TIME ) into Timestamp formats.

```
"transforms": "TimestampConverter",
"transforms.TimestampConverter.type": “org.apache.kafka.connect.transforms.TimestampConverter$Value",
"transforms.TimestampConverter.format": "yyyy-MM-dd HH:mm:ss",
"transforms.TimestampConverter.target.type": "Timestamp"
```

The Entire stream lineage can be visualized in the Confluent UI :-

![]({{ site.baseurl }}/assets/blog-images/sp_blogs/ksql_connect_demo/demo_1_lineage.png)


Let’s see this working in action,
I will be adding a few records into our input database, and look for the output values in the sink database. We will be looking at the hourly averages in this post.

```
insert into voltages (id, date_time, voltage) values ('11', '12-04-2014 11:20:30', 234.01);
insert into voltages (id, date_time, voltage) values ('11', '12-04-2014 11:22:30', 233.51);
insert into voltages (id, date_time, voltage) values ('11', '12-04-2014 11:23:30', 233.50);
```

![]({{ site.baseurl }}/assets/blog-images/sp_blogs/ksql_connect_demo/op1.png)

## Conclusion

So far, we have seen an end to end pipeline that will ingest records from a database into a kafka topic using Source connectors, process these records using ksqlDB, and finally dump these calculated values back into the database, all in real-time.
Thank you for reading !!
