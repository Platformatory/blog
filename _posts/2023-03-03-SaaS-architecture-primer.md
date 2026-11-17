---
layout: post
title:  "Building whatever (X) as a service: XaaS"
author: p6
categories: [ Platform Engineering, Data, SaaS, API Metering ]
image: assets/blog-images/mainfesto.jpg
featured: true
hidden: true
weight: -11
teaser: An architecture primer for SaaS upstarts.
toc: true
---

# Architecture isn't dead

Early-stage SaaS runs on time-to-ship; tech debt is the norm and big upfront architecture is a red herring. But emergent architectures don't emerge by accident. The good ones follow a north star and deliberate guardrails.

# Everything is a tenancy problem

Multi-tenancy fuels SaaS and creates three chronic problems:

- **Noisy neighbours:** degrade others' performance
- **Freeloaders:** consume beyond their tier
- **Under-utilisers:** too little value; churn risk

"Pay for what you use" is hard: what you meter drives billing that customers find opaque and unpredictable. Many fall back to quotas around a vague business value, or plain infrastructure tiers. Even hyperscale SaaS struggles with usage fairness and with attributing infra cost to subscribed price.

Minimum FinOps principles:

- **Price on the most self-evident business metric** (consumption units). Occam's razor. Meter it with the finest labels possible.
- **Map consumption units to internal cost units**, given your tenancy and clustering model.
- The ratio is your **exchange rate**, the clearest view of your unit economics.

# Build on platform primitives, not reinvented wheels

You'll likely build on public cloud. Proprietary services are compelling but cut your leverage to move, which matters most if you're multi- or hybrid-cloud. Balance it:

- Standardise on mature open source
- Adopt tools that have become platform interfaces themselves
- Prefer managed cloud offerings of those, over fully proprietary services

# BYOC matters in multi-cloud, hybrid-cloud markets

Decide early:

- Will you ever deploy outside your cloud (on-prem, regulated domains)?
- Data sovereignty and legal constraints per market
- Is a cloud marketplace a go-to-market channel?

Tenant customers around availability clusters, with a choice of cloud. Complex products split into control plane and data plane; colocate the control plane with the provider. For on-prem, standardise on Kubernetes as the chassis.

# Think ecosystems

Builders want the whole value chain; weigh the cost and ROI of overreach. SaaS owns the critical path of a user experience; PaaS owns the developer experience of a technology. Someone will always do parts of it better.

Be brutally honest about what's core, adjacent and peripheral. Partners compound your scale, integration and stickiness. Define:

- Your ecosystem proposition
- What partners get, usually revenue share
- An API strategy focused on key integrations
- Extension points as plugins in sandboxed runtimes (e.g. WebAssembly)
- Fairness: don't compete for the market your partners serve
