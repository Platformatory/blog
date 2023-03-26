---
layout: post
title:  "Verify Auth0 JWT Authenticity with Kong"
author: dasasathyan
categories: [ Platform Engineering, Data, Infrastructure, AWS, Cloud, API ]
featured: true
hidden: true
teaser: AWS API Gateway with Swagger in Terraform
toc: true
---

Kong is used to create and manage APIs, adjust for scaling, Authentication on services for protection, Traffic control to restrict inbound and outbound API traffic and a lot more. 

Auth0 is a readily available solution to authenticate and authorize services to the applications. The team and organization can avoid the cost, time, and risk that come with building their own solution to authenticate and authorize users.

We use the JWT tokens to authenticate and authorize external services and applications. JWT is nothing but a simple JSON in encoded format. So how do we verify the authenticity of any JWT token as anyone can create a simple JSON and encode it. But there is also a hidden piece of information of the issuer of the JWT under the headers section which has the Algorithm & Token Type of the JWT. We have various ways to check for authenticity but Kong is one of the easiest ways to do it.

Before proceeding the following are the few Prerequisites that are required

1. Create an Auth0 account. Account name is referred to as "kong-auth0-blog" in the blog.
1. Setup a Kong instance on your machine. This guide assumes a brand new blank instance.
1. Install httpie - a http command line utility built for humans (unlike curl).


We need to create an API, service, consumer and a route to which the requests would be redirected to.

1. Create API - http POST :8001/services name=example-api  url=http://httpbin.org
1. Create Service - http POST :8001/services/example-api/routes hosts:='["example.com"]'
1. Create JWT Plugin - http POST :8001/services/example-api/plugins name=jwt
1. Download pem key from auth0 - http https://kong-auth0-blog.us.auth0.com/pem --download    # change region accordingly
1. Transform Certificate into public key - openssl x509 -pubkey -noout -in kong-auth0-blog.pem > pubkey.pem
1. Create consumer for a user - http POST :8001/consumers username=demouser
1. Associate Consumer to public key - http post :8001/consumers/demouser/jwt algorithm=RS256 rsa_public_key@./pubkey.pem key=https://kong-auth0-blog.us.auth0.com/ -f

The API, consumer and the plugin are created and the public key is associated with the consumer. We should now be able to make calls to the service with the generated JWT. If the JWT is valid, we get a valid response, else we see 401 or 403.
Make call using

	http GET :8000 Host:example.com Authorization:"Bearer {{TOKEN}}" -v

The above steps work well when the kong is installed locally. What if the kong is running on a kubernetes(k8s) cluster. We need to create Custom Resource Definitions for KongConsumer, KongPlugin along with the pem key as a secret.

It is important to have the Kong Ingress controller installed in the k8s cluster. It can be installed by following the official Kong docs https://docs.konghq.com/kubernetes-ingress-controller/latest/deployment/overview/ Also, we have a simple httpbin service running for testing.

```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: httpbin
spec:
  progressDeadlineSeconds: 600
  replicas: 1
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      app: httpbin
  strategy:
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%
    type: RollingUpdate
  template:
    metadata:
      creationTimestamp: null
      labels:
        app: httpbin
    spec:
      containers:
      - image: docker.io/kennethreitz/httpbin
        imagePullPolicy: Always
        name: httpbin
        ports:
        - containerPort: 80
          protocol: TCP
        resources: {}
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext: {}
      terminationGracePeriodSeconds: 30
```

Kong has a lot of in-built plugins to use. The list of available kong plugins can be found from https://docs.konghq.com/hub. We will first create the manifest for the Kong JWT Plugin with the following configuration. Save the following config to a yaml file and apply it using

    kubectl apply -f <file_name>



### jwt plugin

```
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
name: app-jwt-k8s
plugin: jwt

Next we need to add a route to our Kong Ingress and annotate the route to the plugin.

apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
name: demo-jwt
annotations:
konghq.com/strip-path: "true"
konghq.com/plugins: app-jwt-k8s
spec:
ingressClassName: kong
rules:
- http:
paths:
- path: /bar
pathType: ImplementationSpecific
backend:
service:
name: httpbin
port:
number: 80
```
