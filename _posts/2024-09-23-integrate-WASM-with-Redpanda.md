---
layout: post
title: "How to integrate WASM with Redpanda"
author: Zeenia
categories: [Apache Kafka, Docker Compose, WASM, Redpanda, Data processing]
image: <img src="../assets/blog-images/wasm-integration/wasm_integrate.png" alt="Create_topic" width="900"/>
teaser: Discover the powerful combination of WebAssembly (WASM) and Redpanda in our latest blog post! Learn how to perform real-time data transformations directly within Redpanda, minimizing latency and maximizing efficiency. With WASM, you can write custom processing logic in multiple languages and execute it seamlessly on your data streams. From sanitizing sensitive information to transforming data formats, we’ll guide you through practical examples and setup steps. Unlock the full potential of your streaming data with this innovative integration!
featured: false
hidden: false
toc: true
---


# How to integrate WASM with Redpanda 


# Introduction


## Redpanda

Redpanda is a fully-featured streaming data platform compatible with Apache Kafka, built from scratch to be more lightweight, faster, and easier to manage. Free from Zookeeper and JVM, it prioritizes an end-to-end developer experience with a huge ecosystem of connectors, configurable tiered storage, and more. 

Redpanda is highly efficient at processing and streaming large volumes of real-time data with minimal latency, handling high-throughput workloads effectively. Its user-friendly command-line interface (CLI) is designed to be straightforward, making real-time data management simpler and more efficient.


## What is WASM (WebAssembly)? 

WASM, or WebAssembly, is a lightweight technology that allows users to write transformations in any supported WASM languages like C, C++, Rust, and many more. It can also run within other applications. It integrates seamlessly with JavaScript while ensuring a secure environment, making it perfect for performance-critical applications. With WASM, developers can create high-performance, scalable web applications with greater flexibility and efficiency. 


# How do Redpanda and WASM work together? 

Integrating WASM with Redpanda allows you to perform data transformations directly on the Kafka broker. This enables engineers to read data, prepare messages, and make API calls within brokers, avoiding unnecessary data transfers. Redpanda Data Transforms which is built on the WASM engine and lets you run a piece of code (.wasm) on chosen data (topics), on location, triggered by events in an auditable. To read more about this architecture, check out this [document](https://www.redpanda.com/blog/wasm-architecture) 

For [example](#setting-up-redpanda-for-wasm-development), you might set up an Apache Kafka Streams application process and filter JSON events from your ecommerce website in real time, removing sensitive credit card information before storing or further processing them. 

With WASM, you can perform similar transformations directly within the Repanda broker itself. WASM allows you to write custom processing logic in various languages, such as JavaScript in this example and compile it to the WASM module. This module can then be executed inside Redpanda, enabling you to filter, transform or aggregate data directly as it streams through the broker. This approach reduces the need for external processing frameworks and can improve the performance by integrating data transformations directly into the streaming pipeline. 


# Benefits of WASM for Stream Processing 



1. **High Performance**: WASM modules with high speed, providing high performance for data processing tasks. This is crucial for handling large volumes of streaming data with minimal latency. 
2. **Portability**: WASM is designed to run consistently across different platforms and environments. This allows you to deploy stream processing login in various systems without modification. 
3. **Security:** WASM operates in a secure, isolated environment, reducing the risk of malicious attack as it doesn’t allow disk read/write. This ensures that stream processing tasks are executed in a controlled and safe manner. 
4. **Reduce Overhead:** WASM is lightweight compared to traditional virtual machines, which translates into lower resource consumption and faster startup times. This is beneficial for real-time stream processing where efficiency is crucial.
5. **Multi-Language Support**: WASM supports multiple programming languages, allowing developers to use the most appropriate language for their processing logic. 


# Use Cases for WASM



1. **Real-Time Data Formatting**: Use WASM to perform real-time data transformations, such as converting JSON to AVRO, or other formats directly within Redpanda. This minimizes the need for external processing frameworks and reduces data latency. For an example of transforming JSON formatted messages to an AVRO schema, check out [example](https://github.com/redpanda-data/redpanda-examples/tree/main/wasm/js/transform_avro)
2. **Sanitizing Input Data**: Apply WASM to remove or alter sensitive data in real time before it is processed or stored. This ensures sensitive information is protected and compiles with data privacy regulations. You can check the [example](#setting-up-redpanda-for-wasm-development) below, where we are removing the credit card details. 
3. **Efficient Computation**: Offload computationally intensive tasks to WASM to take advantage of its near-native performance. This helps to optimize the overall performance of a stream processing pipeline. 


# Setting up Redpanda for WASM development 

This example uses the async engine to map the messages and filter out the credit card information based on the user input. 

We are running Redpanda service as a docker container. We have created a docker compose file, which creates the docker container for the Redpanda,


```yml
networks:
  redpanda_network:
	driver: bridge
	ipam:
  	config:
  	- subnet: 172.24.1.0/24
    	gateway: 172.24.1.1
services:
  redpanda:
	command:
  	- redpanda
  	- start
  	- --node-id 0
  	- --smp 1
  	- --memory 1G
  	- --overprovisioned
	image: docker.vectorized.io/vectorized/redpanda:v21.12.1-wasm-beta1
	container_name: redpanda
	networks:
  	redpanda_network:
    	ipv4_address: 172.24.1.2
	volumes:
  	- ./redpanda-wasm.yaml:/etc/redpanda/redpanda.yaml
  	- ../wasm/js/transform_avro:/etc/redpanda/wasm/js/transform_avro
  	- ../clients:/etc/redpanda/clients
	ports:
  	- 8081:8081  # Schema registry port
  	- 8082:8082 # Pandaproxy port
  	- 9092:9092 # Kafka API port
  	- 9644:9644  # Prometheus and HTTP admin port
```


This example JavaScript transform uses the async engine to map JSON formatted messages to an AVRO schema. 



* Start Redpanda Container

    ```
    docker compose -f docker-compose/compose-wasm.yml up -d
    ```


* Install the node.js in the Redpanda Container

    ```
    docker exec --user root -it redpanda /bin/bash 
    ```



    ```
    curl -fsSL https://deb.nodesource.com/setup_17.x | bash - 
    apt-get install -y nodejs
    ```


* Build & Deploy Coproc
    * Create the js file to filter out the credit card detail from the data based on the variable “not_store_bank_info” within a stream processing environment.

        ```js
        const {
        SimpleTransform,
        PolicyError,
        PolicyInjection,
        calculateRecordBatchSize
        } = require("@vectorizedio/wasm-api");

        // Define the variable to control the inclusion of credit card info
        const not_store_bank_info = process.env.NOT_STORE_BANK_INFO || "yes";

        const transform = new SimpleTransform();

        /**
        * Topics that fire the transform function
        * - Earliest
        * - Stored
        * - Latest
        */
        transform.subscribe([["customer_data", PolicyInjection.Latest]]);

        /**
        * The strategy the transform engine will use when handling errors
        * - SkipOnFailure
        * - Deregister
        */
        transform.errorHandler(PolicyError.SkipOnFailure);

        /* Auxiliary transform function for records */
        const transformToJSON = (record) => {
            const obj = JSON.parse(record.value);
            if (not_store_bank_info === "yes") {
            delete obj.CreditCardNumber;// Remove credit card info if not storing
            
            }
            //console.log("After transformation: ", obj);
            //console.log("Record: ", record);
            const newRecord = {
            ...record,
            value: Buffer.from(JSON.stringify(obj)),
        };
        //console.log("newRecord: ", newRecord);
        return newRecord;
        }

        /* Transform function */
        transform.processRecord((batch) => {
            const result = new Map();
            const transformedBatch = batch.map(({ header, records }) => {
            const transformedRecords = records.map(transformToJSON);
            return {
                header,
                records: transformedRecords,
            };
            });
            result.set("json",transformedBatch); // Set the transformed data as JSON
            // processRecord function returns a Promise
            return Promise.resolve(result);
        });
            
        exports["default"] = transform;
        ```


    * This script is a Node.js script for dynamically configuring and running Webpack to bundle JavaScript file. 

        ```js
        #!/usr/bin/env node
        const webpack = require("webpack");
        const fs = require("fs");

        fs.readdir("./src/", (err, files) => {
        if (err) {
            console.log(err);
            return;
        }
        const webPackOptions = files.map((fileName) => {
            return {
            mode: "production",
            entry: { main: `./src/${fileName}` },
            output: {
                filename: fileName,
                libraryTarget: "commonjs2",
            },
            performance: {
                hints: false
            },
            target: 'node',
            };
        });
        webpack(webPackOptions, (err, stat) => {
            if (err) {
            console.log(err);
            }
            const info = stat.toJson();
            if (stat.hasErrors()) {
            console.error(info.errors);
            }
            if (stat.hasWarnings()) {
            console.warn(info.warnings);
            }
        });
        });
        ```


    * Run the following commands 

        ```
        cd wasm/js/transform_avro

        # install js dependencies in node_modules
        npm install

        # bundle js application with Webpack
        npm run build
        ```


* Create the topic 

    ```
    rpk topic create customer_data
    ```

    <img src="../assets/blog-images/wasm-integration/create_topic.png" alt="Create_topic" width="900"/>



    ```
    rpk topic list
    ```
    
    <img src="../assets/blog-images/wasm-integration/list_topic.png" alt="List_opic" width="900"/>


* Deploy the transform script to Redpanda 

    ```
    rpk wasm deploy dist/main.js --name customer_data --description "Getting the customer data"
    ```
    
    <img src="../assets/blog-images/wasm-integration/Deploy.png" alt="Deploy" width="900"/>


* Produce JSON Records and Consume AVRO Results 
    * Start two consumers (run each command below in a separate terminal) 

        ```
        rpk topic consume customer_data
        rpk topic consume customer_data._json_
        ```


    * Start the producer (in a third terminal)

        **producer.js**


        ```js
        import chalk from "chalk";
        import csv from "csv-parser";
        import parseArgs from "minimist";
        import path from "path";
        import { addDays } from "date-fns";
        import { createReadStream } from "fs";
        import { Kafka } from "kafkajs";

        let args = parseArgs(process.argv.slice(2));
        const help = `
        ${chalk.red("customer_data.js")} - Produce events to an event bus by reading data from a CSV file

        ${chalk.bold("USAGE")}

        > node produce_customer_data.js --help
        > node produce_customer_data.js [-f path_to_file] [-t topic_name] [-b host:port] [-d date_column_name] [-r] [-l]

        By default, the producer script will stream data from customer_data.csv and output events to a topic named customer_data.

        If either the loop or reverse arguments are given, file content is read into memory prior to sending events.
        Don't use the loop/reverse arguments if the file size is large or your system memory capacity is low.

        ${chalk.bold("OPTIONS")}

            -h, --help              	Shows this help message

            -f, --file, --csv       	Reads from file and outputs events to a topic named after the file
                                            default: ../../data/customer_data.csv

            -t, --topic             	Topic where events are sent
                                            default: customer_data

            -b, --broker --brokers  	Comma-separated list of the host and port for each broker
                                            default: localhost:9092

            -d, --date              	Date is turned into an ISO string and incremented during loop
                                            default: Date

            -r, --reverse           	Read file into memory and then reverse

            -l, --loop              	Read file into memory and then loop continuously

        ${chalk.bold("EXAMPLES")}

            Stream data from the default file and output events to the default topic on the default broker:

                > node produce_customer_data.js

            Stream data from data.csv and output to a topic named data on broker at brokerhost.dev port 19092:

                > node produce_customer_data.js -f data.csv -b brokerhost.dev:19092

            Read data from the default file and output events to the default topic on broker at localhost port 19092:

                > node produce_customer_data.js --brokers localhost:19092

            Read data from the default file into memory, reverse contents, and send events to the default topic on broker at localhost port 19092:

                > node produce_customer_data.js -rb localhost:19092

            Read data from the default file into memory, reverse contents, output ISO date string for Date prop:

                > node produce_customer_data.js --brokers localhost:19092 --reverse --date Date

            Same as above, but loop continuously and increment the date by one day on each event:

                > node produce_customer_data.js -lrb localhost:19092 -d Date
        `;

        if (args.help || args.h) {
        console.log(help);
        process.exit(0);
        }

        const brokers = (args.brokers || args.b || "localhost:19092").split(",");
        const csvPath =
        args.csv || args.file || args.f || "/etc/redpanda/clients/js/customer_data.csv";
        const topic =
        args.topic || args.t || path.basename(csvPath, ".csv") || path.basename(csvPath, ".CSV");
        const dateProp = args.date || args.d;
        const isReverse = args.reverse || args.r;
        const isLoop = args.loop || args.l;

        const redpanda = new Kafka({
        clientId: "example-customer-producer-js",
        brokers,
        });
        const producer = redpanda.producer();

        /* Produce single message */
        const send = async (obj) => {
        try {
            const json = JSON.stringify(obj);
            await producer.send({
            topic: topic,
            messages: [{ value: json }],
            });
            console.log(`Produced: ${json}`);
        } catch (e) {
            console.error(e);
        }
        };

        const run = async () => {
        let lastDate;
        console.log("Producer connecting...");
        await producer.connect();
        let data = [];
        // Transform each CSV row as JSON and send to Redpanda
        createReadStream(csvPath)
            .pipe(csv())
            .on("data", function (row) {
            if (dateProp) {
                if (!row[dateProp]) {
                throw new Error("Invalid date argument (-d, --date). Must match an existing column.");
                }
                row[dateProp] = new Date(row[dateProp]);
            }
            if (isLoop || isReverse) {
                // set last date if we have a date prop, and either if 1) we are on the first entry while reversed or 2) not reversed
                if (dateProp && ((isReverse && !lastDate) || !isReverse)) lastDate = row[dateProp];
                data.push(row);
            } else {
                send(row);
            }
            })
            .on("end", async function () {
            if (isLoop || isReverse) {
                if (isReverse) data.reverse();
                for (let i = 0; i < data.length; i++) {
                await send(data[i]);
                }
                while (isLoop) {
                for (let i = 0; i < data.length; i++) {
                    if (dateProp) data[i][dateProp] = lastDate = addDays(lastDate, 1);
                    await send(data[i]);
                }
                }
            }
            });
        };
        run().catch((e) => console.error(e));

        /* Disconnect on CTRL+C */
        process.on("SIGINT", async () => {
        try {
            console.log("\nProducer disconnecting...");
            await producer.disconnect();
            process.exit(0);
        } catch (_) {
            process.exit(1);
        }
        });
        ```



        ```
        cd clients/js
        npm install 
        node producer.js -rd Date
        ```



        **Note**: The topic customer_data._json_ doesn’t exist, but it will be automatically created once the WASM function begins consuming events from the topic customer_data. 

* Output

    After starting the producer

    * Output from customer_data

        The output will contain many lines of JSON string representations of the events being sent to the topic customer_data.


        <img src="../assets/blog-images/wasm-integration/customer_data_output.png" alt="customer_data" width="900"/>


    * Output from customer_data._json_

        The output will be the string representations of the json-serialized data where we filter the credit card number events being sent to customer_data._json_ 


        <img src="../assets/blog-images/wasm-integration/customer_data_json_output.png" alt="customer_data_json_output" width="900"/>


    * Output from the producer terminal

        <img src="../assets/blog-images/wasm-integration/customer_data_producer.png" alt="Producer_output" width="900"/>




# Conclusion

Integrating WebAssembly (WASM) with Redpanda provides a powerful solution for efficient stream processing. Redpanda’s high-performance, Kafka-compatible platform combined with WASM’s lightweight, fast execution enables you to perform complex, real-time data transformations directly within the broker. This integration reduces latency, minimizes overhead, and enhances security, streamlining your data processing pipeline and improving overall performance. By following the steps in this guide, you can leverage WASM to optimize and customize your data streaming workflows effectively.
