---
layout: post
title: "A Platform engineering manifesto"
author: p6
categories:
  [Platform Engineering, Data, Infrastructure, Kafka, Kong, Kubernetes]
image: assets/blog-images/platform-strategy.svg
featured: true
hidden: true
cat_box_title: Contact Us
ctas:
  - title: Get In Touch
    description: "Have questions or need assistance? Our team is here to help"
    url: "/contact/"

teaser: Platform Engineering is dead. Long live platform engineering!
toc: true
---

![50-shades](/blog/assets/blog-images/50-shades.jpg "50 Shades of DevOps")

Done well, platform engineering gives you a digital-native operating model. Done badly, it's a pile of tools from the CNCF graveyard. Platforms exist to accelerate product teams in real business domains.

**When you need one:** engineering org past the Dunbar number, or a non-trivial scale problem. Otherwise, don't.

**Measure it by:**
- Product-team NPS / CSAT (developer experience)
- Platform product usage
- Coverage of platform concerns; time to first production deploy

# Own the architecture and the product vision

Platform teams own a product charter and an evolving architecture. Requirements come from the domain, the product teams and the incumbent IT estate.

> North star: smart infrastructure, data integration, APIs. That covers most of the value.

# Build tooling for developers and operators

"You build it, you run it" rarely holds. Autonomous teams reinvent wheels; reuse is efficiency. A lean, craft-focused platform team specialises in cross-cutting concerns and keeps the estate governed. Typical outputs:

- Infrastructure-as-code modules
- Golden images and build/run-time tooling
- Shared CI/CD pipelines
- Observability toolkits

# Run shared services securely across tenants and clouds

Enterprise operations is a tenancy problem: who shares what. Support dedicated and shared tenancy based on resource contention, security, availability, compliance and cost. Support both embedded DevOps ("build and run") and shared SRE/cloud-ops ownership.

> Add governance, and cost attribution or chargeback to the teams that pay.

# Specialise in complex distributed systems

Managed services are leaky abstractions. Vendor neutrality and cost at scale (or lack of scale) mean managed and self-managed services coexist, and someone must own the fit.

What separates platform engineering from generic cloud/DevOps: deep expertise in the distributed systems that are now platform primitives, the Lego blocks for higher-order platforms.

> Adoption is capped by expertise. Build artisanal guilds that can diagnose distributed-systems problems and own performance, security and other cross-cutting concerns.
