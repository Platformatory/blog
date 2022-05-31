---
layout: post
title:  "Stream Processing 101 with Databricks and Apache Kafka"
author: Srikanth Pai
categories: [ Data Engineering, Confluent Kafka, Kafka Connect, Databricks, Azure, Spark, PySpark ]
image: assets/blog-images/sp_blogs/kafka_spark_demo/intro_pyspark1.jpg
featured: true
hidden: true
---

## Stream Processing 101 with Databricks / Spark and Apache Kafka

In today’s technology-driven world, every second a vast amount of data is generated. Constant monitoring and right analysis of such data are necessary to draw meaningful and useful insights.

Real-time data from sensors, IoT devices, log files, social networks, etc. needs to be closely monitored and immediately processed. Therefore, for real-time data analytics, we need a highly scalable, reliable, and fault-tolerant data streaming engine.

### Data Streaming

Data streaming is a way of collecting data continuously in real-time from multiple data sources in the form of data streams. Datastream can be thought of as a table that is continuously being appended.

Data streaming is essential for handling massive amounts of live data. Such data can be from a variety of sources like online transactions, log files, sensors, in-game player activities, etc.
There are various real-time data streaming techniques like Apache Kafka, Spark Streaming, Apache Flume etc. 

### Spark Streaming

Spark Streaming is an integral part of Spark core API to perform real-time data analytics. It allows us to build a scalable, high-throughput, and fault-tolerant streaming application of live data streams. Spark Streaming supports the processing of real-time data from various input sources and storing the processed data to various output sinks.

### Example use case

Let us consider we have a file containing the data, somewhere in a database table and want to perform some calculations on this data for regular time windows and subsequently dump these computed values back into a database table. For the purpose of this experiment I will be using an open source electric power consumption dataset, available on Kaggle. 

This dataset contains measurements of electric power consumption in one household with a one-minute sampling rate over a period of time.


Let’s say we want to analyze the user’s power consumption habits for every hour or every 30 minutes. This could give us a lot of insights about the user’s electric appliance usage activity.

![]({{ site.baseurl }}/assets/blog-images/sp_blogs/kafka_spark_demo/intro2.png)

In this blogpost, we will take on a hypothetical IoT use-case which will explain data stream processing using PySpark on Azure Databricks and Apache Kafka to move the data in and out of the databricks ecosystem.

My workflow and Architecture design for this use case include a table containing the power consumption data in a postgreSQL table, Confluent Kafka to ingest and sink the records and Databricks Community Edition to process the ingested records.

#### Requirements:

* Databricks Community Edition
* Confluent Cloud Account
* DigitalOcean or any cloud provider to host our input table.

## Overview of the Architecture:

![]({{ site.baseurl }}/assets/blog-images/sp_blogs/kafka_spark_demo/flow.png)

Let’s take a look at the steps required to deal with this demonstration


## Get data into Kafka

For this, one could assume that the IoT devices themselves write to Kafka; However, this maybe error prone or even inefficient over a network; In a practical scenario, this may be written to a local database in an IoT hub or aggregated to a more central location, like a Data Warehouse or a Data Lake.

In any case, such data must be sourced: That is, pulled into Kafka. Kafka Connect provides a framework for "pull-based" ingestion of data into Kafka from various heterogeneous sources, along with declarative control on parallel ingestion.It further, also has the concept of SMTs [Single Message Transform] - which enable small and simple transforms to be embedded directly into the connect pipeline.


## Process data in Databricks using PySpark


Reading from a kafka topic:

```
voltage_stream = spark.readStream\
                    .format('kafka')\
                    .option("kafka.bootstrap.servers", kafka_bootstrap_server)\
                    .option("kafka.security.protocol", "SASL_SSL")\
                    .option("kafka.sasl.jaas.config", "kafkashaded.org.apache.kafka.common.security.plain.PlainLoginModule required username='{}' password='{}';".format(confluentApiKey, confluentSecret))\
.option("kafka.ssl.endpoint.identification.algorithm", "https")\
                    .option("kafka.sasl.mechanism", "PLAIN")\
                      .option("subscribe", 'demo2_voltages10k')\
                  .option("startingOffsets", "earliest")\
                  .option("failOnDataLoss", "false")\
                  .load()\
                    .selectExpr("CAST(value AS STRING)").alias('value')\
                    .withColumn('voltages_data', F.from_json(F.col("value"),schema)) \
                   .select("voltages_data.*")
```

Here the schema is imposed upon the incoming records to get the dataframe.

```
schema = StructType([
  StructField("id", StringType(), True),
  StructField("date_time", StringType(), True),
  StructField('voltage', DoubleType(), True)
])
```

#### Window Operations on Event Time

Aggregations over a sliding event-time window are straightforward with Structured Streaming and are very similar to grouped aggregations. In a grouped aggregation, aggregate values (e.g. counts) are maintained for each unique value in the user-specified grouping column. In case of window-based aggregations, aggregate values are maintained for each window the event-time of a row falls into.



To calculate hourly windows, we use the window function from "pyspark.sql.functions"
```
hourly_windows = voltage_df.select( 'id', F.col('date_time_col'), 'voltage')\
                    .withWatermark("date_time_col", "1 hour") \
                    .groupBy( 'id', F.window('date_time_col', "1 hour"))\
                    .agg(F.avg('voltage').alias('hourly_average_voltage'))\
                    .select( F.col('hourly_average_voltage').cast('float') , \
                           'window.start', 'window.end')
```

Finally, we write serilaize this dataframe into AVRO format, and write this binary data to a kafka topic.

```
avroDataFrame
      .writeStream
      .format("kafka")
      .option("kafka.bootstrap.servers", $kafka_bootstrap_server)
      .option("topic", "hourly_average_voltages")
      .option("kafka.security.protocol", "SASL_SSL")
      .option("kafka.sasl.jaas.config", "kafkashaded.org.apache.kafka.common.security.plain.PlainLoginModule required username=$confluentApiKey password=$confluentSecret")
      .option("kafka.sasl.mechanism", "PLAIN")
      .option("checkpointLocation","/delta_checkpoint_location/cp/")
      .start()
```


This application that we’ll be looking at will in real-time, ingest, process and sink records into a PostgreSQL Database by using :
1. Confluent Kafka Connect for ingesting the records from a table in a postgreSQL database; and to export it back to a new table in the database table.
2. Databricks Community Edition to process the incoming records from the kafka topic.


The downstream data in the PostgreSQL database is read by any Dashboarding platform and reports can be created to gain business insights into the telemetry stream.

## Conclusion

So far in this post, we’ve looked at event ingestion from Confluent Kafka, how we can read data in Databricks Notebook from a Kafka topic and processing the data in a Databricks notebook using PySpark/Spark.
Thank you for reading !!


