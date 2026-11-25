---
layout: page
title: About
permalink: /about
description: "The Write Ahead Log is Platformatory's engineering journal on platform engineering, data streaming, data infrastructure, SRE and applied AI."
---

**The Write Ahead Log** is the engineering journal of [Platformatory]({{ site.organization.url }}). It covers what we build and run for clients: platform engineering, Kafka and stream processing, change data capture, data infrastructure, SRE and applied AI.

## Topics

{% assign cats = site.categories | sort %}
{% for c in cats %}{% if c[1].size > 1 %}[{{ c[0] }}]({{ site.baseurl }}/category/{{ c[0] | slugify }}/) ({{ c[1].size }}){% unless forloop.last %} · {% endunless %}{% endif %}{% endfor %}

## Authors

{% for a in site.authors %}{% assign key = a[0] %}{% assign n = 0 %}{% for p in site.posts %}{% assign keys = p.authors | default: p.author | split: "," %}{% for k in keys %}{% assign ks = k | strip %}{% if ks == key %}{% assign n = n | plus: 1 %}{% endif %}{% endfor %}{% endfor %}{% if n > 0 %}
- **{{ a[1].display_name }}**: {{ a[1].description }}{% endif %}{% endfor %}

## Follow

- [RSS feed]({{ site.baseurl }}/feed.xml)
- [llms.txt]({{ site.baseurl }}/llms.txt) for AI agents, with [full text]({{ site.baseurl }}/llms-full.txt)
- [Twitter](https://twitter.com/{{ site.twitter.username }}) · [GitHub](https://github.com/platformatory)
