---
layout: post
title: Running Agentic AI as an Enterprise Platform
author: p6
categories:
- platform-engineering
- ai
image: assets/blog-images/platform-engineering-3/factory-tier.svg
featured: true
weight: 5
hidden: false
teaser: Platform Engineering 3.0 means running agentic AI as an enterprise platform.
  The software factory is where it has to pay off first.
description: Platform Engineering 3.0 means running agentic AI as an enterprise platform.
  The software factory is where it has to pay off first.
toc: true
---

In 2021 we published a [platform engineering manifesto](/blog/platform-engineering-manifesto/) with a deliberately cheeky teaser: *Platform Engineering is dead. Long live platform engineering!* The case was short. A platform team is justified once an engineering organisation outgrows the Dunbar number. Its job is to extract cross-cutting concerns once, instead of in every team. Its success shows up in three numbers: developer satisfaction, platform usage, and time to first production deployment. Its failure mode is a "mess of 99 problems cherrypicked straight from the CNCF landscape graveyard of tools".

Five years on, the list of 99 problems has been rewritten, and most of the new entries are agents: in support queues, claims desks and ops runbooks, and most visibly in engineering. A CTO who has bought coding-agent seats for every team now has a few hundred autonomous actors opening pull requests, a few dozen MCP servers that nobody registered, three AI gateways, two harnesses per team, and a token bill with no owner. The Dunbar argument also breaks: agents have no Dunbar number, and nothing stops one engineer from starting fifty of them before lunch.

Which leaves that CTO with one question: **what does it take to run agentic AI as a platform for the whole enterprise?** The software factory is the place to answer it first. Agents already work there at volume, and a bad change shows up in a queue you can measure.

* * *

Platform engineering has shifted twice already: from infrastructure tribes run as a shared service, to the platform as a product, with self-service golden paths for developers.[^pe-history] Running agents is the third shift (Platform Engineering 3.0, if you count from the shared-services teams; counted from internal developer platforms it's the second, and "3.0" elsewhere means AI *inside* the platform[^pe-numbering]). The consumers are now developers *and* agents, agents are also workloads the platform hosts, and the resources it governs are models, tokens, tools, context and non-human identities. A developer reads the docs, files a ticket when the golden path is wrong, and has a manager. An agent does none of those things, will run the same wrong path ten thousand times overnight, and acts with whatever authority it was handed.

* * *

What most enterprises have today is craft production with better tools. Every team picks its own machine and sets it up its own way, so quality depends on the craftsman. The numbers come mostly from surveys run by vendors who sell the cure, so treat them as directional:

- **Agents per organisation:** a mean of about 37 in December 2025, with the estate roughly doubling in four months.[^gravitee]
- **Unmonitored agents:** 47% of the roughly 3 million agents deployed by surveyed firms were not actively monitored or secured. 88% of organisations reported a confirmed or suspected agent-related security or privacy incident in the prior year.[^gravitee]
- **Accountability:** only 28% of organisations can trace an agent's action back to a human sponsor.[^csa]
- **Tooling sprawl:** public registries list over 20,000 MCP servers.[^mcp-count] One curated list tracks more than 220 AI gateways.[^gateways]
- **Outcome (forecast):** over 40% of agentic AI projects cancelled by the end of 2027, on cost, unclear value or inadequate risk controls.[^gartner-40]

AI is an amplifier: it magnifies an organisation's existing strengths and weaknesses, and a high-quality internal platform correlates directly with the ability to get value from it.[^dora]  Without one, AI creates local pockets of productivity that get lost in downstream chaos. The evidence is a survey of nearly 5,000 technology professionals and a correlation, so it can't prove the platform causes the gains. It does match what anyone who has watched a hundred agent-generated PRs queue behind four reviewers already suspects.

AI makes code [cheaper to write without making it much faster to ship](/blog/ai-slop-coding-productivity/), because the work moves to specs, evals and review. If that's right, the open question is what has to be built so the moved work doesn't pile up.

* * *

Factories came from what was built around the machines. By 1905, Sakichi Toyoda's power loom carried a device that stopped the machine the moment a weft thread broke or ran out.[^toyoda] Before that, a broken thread meant a loom quietly weaving yards of defective cloth until someone noticed. Once the loom could stop itself, one operator could tend many machines. The idea became *jidoka*, one of the two pillars of the Toyota Production System: build the check into the machine and stop the line at the first defect.[^jidoka]

Every industrialisation since has the same ingredients, and each one maps onto the software factory:

- **Interchangeable parts and standard interfaces**: MCP for tools, A2A between agents, OpenTelemetry for signals, one identity scheme.
- **Standard work**: the documented best way to do a task, which in the factory means context files, skills and golden paths that an agent loads instead of rediscovering.
- **Stopping the line on defects**: validation gates that fail a change before a human ever sees it.
- **A measured yield**: good output per unit of input, tracked continuously.

Stripe is the clearest existence proof that this works for code. Its "minions" are one-shot, unattended coding agents, and over 1,300 pull requests merged each week at Stripe are written entirely by them, up from about a thousand ten days earlier.[^stripe1][^stripe2]  Every PR is reviewed by a human. Around the agent, Stripe built a line:

- **Devboxes:** pre-warmed, ready in about 10 seconds with Stripe's code and services loaded, and isolated from production and the internet.[^stripe1]
- **Toolshed:** one internal MCP server shared by all of Stripe's agents, with around 400–500 tools. Each agent gets a curated subset, and minions get a deliberately small default set.[^stripe2][^toolshed]
- **Blueprints:** workflows defined in code that direct a run, mixing agent steps (implement the task, fix CI failures) with deterministic ones (run the linters, push) that never call a model. CI gets at most two rounds before the branch goes back to its human operator.[^stripe2]

StrongDM pushes the idea to its limit with a "dark factory", a term borrowed from manufacturing for a factory that runs with the lights off. Its rule is that humans don't review code. Humans write specifications and curate scenarios, and agents are validated against digital twins of systems like Okta and Slack.[^strongdm][^willison] Its yardstick for a working factory is at least $1,000 of tokens per engineer per day.[^willison] Its agents once produced a placeholder that passed the tests and did nothing.[^codex] That's the defect jidoka exists to catch: in a lights-out factory the validation suite *is* the definition of correct, and an incomplete suite ships incomplete software.

* * *

## The yield equation

Where the cost of a factory actually goes is simple enough to write down. Let an agent run cost $$c_{run}$$ (tokens plus sandbox time). Let $$p$$ be the fraction of runs that produce a pull request, $$m$$ the fraction of those that merge, and $$c_{rev}$$ the human cost of reviewing one pull request. Every run is paid for, every PR is reviewed, and only merged PRs count, so the cost per merged change is:

$$C_{merged} = \frac{c_{run}}{p \cdot m} + \frac{c_{rev}}{m}$$

An illustrative case, with assumed inputs: $$c_{run} = \$5$$, $$p = 0.6$$, $$m = 0.7$$, and 20 minutes of review at a loaded \$90 an hour, so $$c_{rev} = \$30$$.

$$C_{merged} = \frac{5}{0.42} + \frac{30}{0.7} \approx \$11.90 + \$42.86 \approx \$54.76$$

About four-fifths of that cost is review, and it is divided by the merge rate. Two levers follow:

- **Gates before review raise $$m$$ and cut $$c_{rev}$$.** A change that fails tests, policy or scenario checks goes back to the agent without consuming a reviewer. If gates lift $$m$$ to 0.85 and cut review to 12 minutes ($$c_{rev} = \$18$$), the cost per merged change falls to about \$31, with no change of model.
- **A better model mostly moves $$c_{run}$$, the smallest term**, unless it also raises $$p$$ and $$m$$. Halving $$c_{run}$$ in the base case saves about \$6.

Review capacity also caps throughput, whatever the agents produce. With $$R$$ reviewer-hours a week and $$t$$ hours per review, merged changes per week are bounded by:

$$\text{merged/week} \le \frac{R}{t} \cdot m$$

At 20 minutes a review and $$m = 0.7$$, every 100 reviewer-hours a week yields at most 210 merged changes. Starting more agents fills the queue without raising that ceiling. Gates and standard work are the only things that raise it, because they shorten $$t$$ and lift $$m$$.

The condition that flips this: at dark-factory token rates, $$c_{run}$$ stops being small. At \$1,000 a day per engineer, an engineer overseeing 20 merged changes a day spends \$50 per change on tokens alone, as much as the review term. Past that point, routing and token budgets matter as much as gates. That is where the traffic plane earns its place.

* * *

## The line, layer by layer

![An enterprise agentic AI platform, shown with its first tenant, the software factory: humans and triggers feed an agent harness running in isolated sandboxes on a Kubernetes substrate; all model, tool and agent traffic passes through one traffic plane with identity and budgets; durable workflows orchestrate runs; validation gates sit between the agent and human review; audit and telemetry flow to separate stores.](../assets/blog-images/platform-engineering-3/factory-tier.svg)

### Substrate: Kubernetes, with operators for everything

Agents need a place to run that is isolated, stateful, cheap when idle, and quick to wake. Kubernetes now has a standard shape for this. The SIG Apps `agent-sandbox` subproject defines a `Sandbox` custom resource for singleton, stateful workloads such as agent runtimes: one pod with a stable hostname and network identity, isolated by gVisor or Kata Containers, kept warm by a `SandboxWarmPool`, and able to scale to zero and resume where it left off.[^agent-sandbox] Agents themselves are becoming resources too. kagent, a CNCF Sandbox project, declares agents, tools and model configurations as CRDs, and Kagenti gives agents SPIFFE identities.[^kagent][^kagenti]

My bet is that the substrate stays Kubernetes-centric even when the work runs elsewhere. Operators will reconcile a sandbox on a hyperscaler, a model endpoint on a GPU cluster, and an MCP server in a SaaS tenant, the way Crossplane taught platform teams to reconcile cloud resources they don't host. The price is real: more CRDs, more reconciliation loops, and upgrades that need choreography. It's the price the last platform era already paid, and it buys one control plane where policy lives.

### Identity: the deepest rabbit hole

The first layer of the identity problem has already been tidied up. The MCP specification of 2025-11-25 made Client ID Metadata Documents the preferred way for a client to identify itself: the client ID is a URL that hosts the client's own metadata, and Dynamic Client Registration dropped to a fallback. The 2026-07-28 revision deprecates DCR for new implementations.[^cimd]

CIMD answers *which client software is this?* A factory needs more. It needs to know which agent instance is acting, on whose behalf, and with what delegated authority, and it needs to revoke that authority without revoking the human's. That is where the standards are still drafts:

- **Enterprise Managed Authorization**, a stable MCP authorization extension, lets the enterprise identity provider decide which clients reach which MCP servers. The client obtains an Identity Assertion JWT Authorization Grant (ID-JAG, the mechanism behind Cross App Access) from the IdP and exchanges it at the MCP server's authorization server. The ID-JAG itself is still an IETF draft, and implementations track different revisions.[^mcp-ema]
- **The IETF WIMSE working group's AIMS draft** gives each agent exactly one workload identifier, optionally a SPIFFE ID, and builds authorisation on OAuth.[^aims] A companion draft profiles it for platforms that host many agent instances per customer.[^wag]
- **Credential swapping at the gateway** keeps enterprise credentials out of the sandbox entirely: the gateway inserts the backend credential as the request leaves.[^google-ace]

Vendors are shipping ahead of the standards. Okta's Agent SSO, which implements Cross App Access, became generally available in August 2026, and Microsoft's Entra Agent ID in April. Each builds on a different subset of the drafts.[^okta][^forkast] Anyone buying identity for agents in 2026 should assume one migration, and choose the vendor whose exit path is clearest.

### The traffic plane: one plane, three routing jobs

Everyone in the enterprise will have access to frontier models and to self-hosted ones (when to run your own is a question of [self-hosting](/blog/self-hosting-llms-air-gapped/) economics and [sovereignty](/blog/ai-sovereignty-intelligence-utility/)). So routing becomes a platform concern, and the gateway market has exploded accordingly. "Routing" covers three separate jobs, and most of the confusion comes from treating them as one:

- **Model selection**, which model should answer this request: vLLM Semantic Router classifies each request and picks a model. It can also filter jailbreaks and PII and cache semantically, all in the request path.[^vsr]
- **Inference endpoint picking**, which replica of that model, given KV-cache contents and load: the Gateway API Inference Extension, with llm-d as a primary implementation.[^llmd]
- **Agent and tool traffic**, governing MCP and A2A calls: agentgateway, a Linux Foundation project, handles LLM, MCP and A2A traffic in one data plane.[^agentgateway]

Budgets, quotas and credential swaps belong in the same plane. Azure's AI gateway, for one, enforces tokens-per-minute limits and returns a 429 when a project exceeds them.[^azure-quota] My rule: one traffic plane per routing job, run by the platform team, preferably on one proxy family. Two hundred and twenty gateways is two hundred and nineteen places where policy drifts.

### Durable execution

A factory run waits on CI, on a flaky dependency, and for days on a human approval. Agent processes that keep their state in memory lose it all on a crash and pay for the tokens twice. Durable execution is now a standard pairing: Temporal's integration with the OpenAI Agents SDK, generally available since March 2026, runs the agent loop as a workflow and model calls as activities.[^temporal] Restate, DBOS and Inngest fill the same niche with different trade-offs, licences among them: only Temporal and DBOS of the four ship under OSI-approved licences.[^licences]  For a tier the whole enterprise depends on, the licence is part of the architecture.

### Context and standard work

Standard work in the factory is context. AGENTS.md (now stewarded by the Agentic AI Foundation, in over 60,000 repositories) and SKILL.md turn "how we do things here" into versioned, reviewable files that agents load.[^agentsmd] Stripe's curated tool subsets are standard work too: an agent offered 500 tools wastes context choosing among them.

Context also outlives tools. A choice of agent framework is reversible in roughly 12 to 18 months; context architecture is much harder to change.[^atlan] So spend the standardisation budget on context, and spend little of it on mandating an SDK.

The factory's context is mostly code, docs and tickets. Business agents need enterprise data, and that pulls context into the data platform. I expect it to be served from lakes that handle vectors natively, but that is a prediction: Iceberg has no native vector index today, so similarity search over it means a full scan or a separate system.[^iceberg-vec]  The live bets are Lance as a table format, S3 Vectors as a storage class, and each warehouse vendor's own engine. [The memory hierarchy](/blog/where-should-your-data-live/) covers the tiers underneath.

### Audit and telemetry are two streams

The last platform era taught teams to sample hard: keep the errors and the slow traces, drop the rest. Agents break that rule for one class of data. Every prompt, tool call, identity and approval is evidence. A security team investigating a prompt injection needs all of it, kept long enough to replay. Operational telemetry can still be sampled. So the factory should run two streams:

- **Audit**: complete, durable, ordered, replayable, and retained by policy. It's a log in the database sense, and it should be built like one.
- **Ops telemetry**: OpenTelemetry end to end, tail-sampled at collectors near the source. The GenAI and agent conventions are still marked Development and moved to their own repository in June 2026, so expect attribute churn.[^otel]

Next, I expect classification to move toward the edge. Small models in collectors and gateways would flag injections, data leaks and runaway loops before anything ships centrally, the way vLLM Semantic Router already classifies requests in-path. Treat that as speculation. I'd call it wrong if, two years from now, guardrail inference still lives only in central SaaS consoles.

### Gates: the andon cord

Every validation gate is an andon cord. Tests, type checks, policy-as-code, scenario suites against digital twins, and a budget check each stop the line and send the change back to the agent with the failure attached. Human review comes after the gates. The yield equation puts the gates first among the layers: they're the only one that improves both terms.

### Frameworks: standardise the contracts

Enterprises can't sustain 200 agent frameworks, and they can't mandate one either. Teams will route around a decree, and the frameworks themselves are consolidating anyway: Microsoft merged AutoGen and Semantic Kernel into Microsoft Agent Framework 1.0 in April 2026.[^maf] The workable rule sits one layer above the frameworks: fix the contracts (MCP, A2A, OTel, the identity scheme, the traffic plane, the sandbox API), sanction two or three harnesses that honour them, and let teams choose inside that set.

* * *

## Rent the machines, own the line

The strongest objection is that all of this is being productised as fast as it can be listed. GitHub's Agent HQ runs Claude and Codex agents inside the pull-request workflow.[^agenthq] Claude Code, Codex cloud, Cursor and Devin each ship sandboxes, admin planes and audit. AWS Bedrock AgentCore, Google's Gemini Enterprise Agent Platform and Microsoft's Foundry bundle runtime, identity, gateway and memory.[^platforms] A CTO who staffs a team to build the line in 2026 risks rebuilding CI in 2015: commodity by the time it works, with the platform team as the new bottleneck.

Much of that is right, and most of the machines should be rented: the agents, the sandboxes, and very likely the durable-execution engine and the identity provider. Four things can't be bought, because they encode your own system:

- **Standard work**: your context, skills and curated tools.
- **The gates**: your definition of a correct change, which no vendor can write for your payment flows or your claims engine.
- **Identity and data policy**: which agent may act for whom, on what.
- **The yield metrics**: cost per merged change, merge rate, review minutes per change, and gate-stopped versus reviewer-stopped defects.

Buying the whole stack from one vendor is the right call when the estate is on one cloud, the engineering organisation is a few hundred people, one agent vendor covers most of the work, and regulatory exposure is low. Outside those conditions, the multi-model, multi-cloud and sovereignty requirements put you back to building the line.

We sell platform engineering and agentic AI consulting, so we have a stake in this argument. The arithmetic above holds whoever builds the line.

* * *

The forecasts point one way:

- **Platforms:** by 2027, 70% of organisations with platform teams will include generative AI capabilities in their internal developer platforms.[^gartner-idp]
- **Teams:** by 2029, 60% of organisations will adopt smaller software engineering teams, up from 15% in 2026, with those "tiny teams" leaning on robust platform engineering teams for standardised, automated workflows and self-service AI tools.[^gartner-teams]
- **IDEs:** by 2027, over 65% of engineering teams using agentic coding will treat the IDE as optional, shifting control, governance and validation to automated platforms.[^gartner-ide]

None of these forecasts names a role. Read together, they describe one: a platform team that runs the enterprise's agentic AI platform, with the factory as its first line, staffed by engineers who understand distributed systems, identity and evaluation in roughly equal parts.

Its KPIs update the 2021 three:

- **Developer satisfaction** becomes satisfaction from developers *and* reviewers, the people who absorb the factory's output.
- **Platform usage** becomes the share of agent runs on the paved road: sanctioned harness, registered identity, governed traffic plane.
- **Time to first production deployment** becomes time from ticket to verified merge, together with cost per merged change and the merge rate.

* * *

## When this is wrong

The design loses under three conditions, each with a signal to watch:

- **Agents learn to validate themselves well enough** that external gates add little. Signal: merge rates of ungated agent PRs approaching gated ones across model generations.
- **Vendor admin planes absorb the line**, exposing policy, identity and gate hooks rich enough that no enterprise needs its own. Signal: whether the major agent platforms let you plug in your own gates and identity provider, or only their own.
- **Dark factories prove review-free delivery safe** for most changes. Then the yield equation loses its review term, and the line becomes almost entirely gates and token economics. That still makes it a platform job, though a different one.

* * *

## What to do this quarter

- Measure cost per merged change, merge rate and review minutes per change before buying more seats.
- Put every agent behind a registered identity with a human sponsor. The 28% who can trace agent actions today are the baseline to beat.
- Pick one traffic plane per routing job and move budgets and credential swaps into it.
- Write the gates before scaling the agents: tests, policy checks, and scenario suites for the systems where a wrong change is expensive.
- Split audit from telemetry, and size the audit store for replay.
- Sanction two or three harnesses on fixed contracts, and spend the standardisation effort on context.

Not every company needs a platform team, only those [past the Dunbar number](/blog/platform-engineering-manifesto/). That threshold now counts actors: an organisation of forty engineers that runs four hundred agents has crossed it. Platform engineering is dead. Long live platform engineering.

[^pe-history]: Platform Engineering community, "The story of platform engineering" (Team Topologies, 2019; "internal developer platform", 2020; Gartner Hype Cycle, August 2022). <https://platformengineering.org/blog/the-story-of-platform-engineering>
[^pe-numbering]: CNCF, "Evolving platform engineering for AI-native workloads," 6 July 2026, <https://www.cncf.io/blog/2026/07/06/evolving-platform-engineering-for-ai-native-workloads/>; env0, "Platform Engineering 3.0: Practical Guidance for Scaling Infrastructure in the AI Era," <https://www.env0.com/resources-center/whitepaper-platform-engineering-3-0>
[^gravitee]: Gravitee, "State of AI Agent Security Report 2026" (survey of 750 enterprise technology leaders; Gravitee sells API and agent gateways). <https://www.gravitee.io/state-of-ai-agent-security>
[^csa]: Cloud Security Alliance, "AI Agent Identity Sprawl: The Enterprise Authorization Crisis" (survey with Aembit, which sells workload and agent access products). <https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-agent-identity-sprawl-authorization-202/>
[^mcp-count]: Zuplo, "Shadow MCP: The Ungoverned AI Agent Tools Putting Your APIs at Risk" (estimate of public MCP servers, mid-2026). <https://zuplo.com/learning-center/shadow-mcp-ungoverned-ai-agent-security>
[^gateways]: awesome-ai-gateway, a curated list of 220+ AI gateways. <https://github.com/cuihuan/awesome-ai-gateway>
[^gartner-40]: Gartner, "Gartner Predicts Over 40% of Agentic AI Projects Will Be Canceled by End of 2027," 25 June 2025. <https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027>
[^dora]: DORA, "2025 State of AI-assisted Software Development." <https://dora.dev/dora-report-2025/>; Google Cloud, "Announcing the 2025 DORA report." <https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report>
[^toyoda]: Toyota Motor Corporation, "The Birth of Jidoka" (Toyoda Power Loom, completed 1897; weft-halting device described in the 1905 model's manual; origin of jidoka in the Toyota Production System). <https://www.toyota-global.com/company/history_of_toyota/75years/text/taking_on_the_automotive_business/chapter1/section1/item4.html>
[^jidoka]: Lean Enterprise Institute, "Toyoda, Sakichi (1867–1930)." <https://www.lean.org/lexicon-terms/toyoda-sakichi-1867-1930/>
[^stripe1]: Stripe, "Minions: Stripe's one-shot, end-to-end coding agents," 9 February 2026. <https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents>
[^stripe2]: Stripe, "Minions: Stripe's one-shot, end-to-end coding agents, Part 2," 19 February 2026. <https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2>
[^toolshed]: ByteByteGo, "How Stripe's Minions Ship 1,300 PRs a Week." <https://blog.bytebytego.com/p/how-stripes-minions-ship-1300-prs>
[^strongdm]: StrongDM, "The StrongDM Software Factory: Building Software with AI." <https://discover.strongdm.com/blog/the-strongdm-software-factory-building-software-with-ai>
[^willison]: Simon Willison, "StrongDM's software factory," 7 February 2026. <https://simonwillison.net/2026/Feb/7/software-factory>
[^codex]: Stanford CodeX, "Built by Agents, Tested by Agents, Trusted by Whom?," 8 February 2026. <https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/>
[^agent-sandbox]: Kubernetes, "Running Agents on Kubernetes with Agent Sandbox," 20 March 2026. <https://kubernetes.io/blog/2026/03/20/running-agents-on-kubernetes-with-agent-sandbox>; <https://github.com/kubernetes-sigs/agent-sandbox>
[^kagent]: CNCF, kagent project page (Sandbox, accepted 22 May 2025). <https://www.cncf.io/projects/kagent/>
[^kagenti]: Signadot, "Running AI Agents on Kubernetes: Agent Sandbox, kagent and More." <https://www.signadot.com/blog/running-ai-agents-on-kubernetes/>
[^cimd]: Model Context Protocol, "Client registration," specification 2026-07-28. <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration>; SEP-991. <https://modelcontextprotocol.io/community/seps/991-enable-url-based-client-registration-using-oauth-c>
[^mcp-ema]: Model Context Protocol, "Enterprise Managed Authorization" extension (`io.modelcontextprotocol/enterprise-managed-authorization`, stable). <https://modelcontextprotocol.io/extensions/auth/enterprise-managed-authorization>
[^aims]: IETF WIMSE WG, "AI Agent Identity Management System (AIMS)," draft-ietf-wimse-aims. <https://datatracker.ietf.org/doc/html/draft-ietf-wimse-aims>
[^wag]: IETF, draft-carleton-workload-authz-grant-00. <https://www.ietf.org/archive/id/draft-carleton-workload-authz-grant-00.html>
[^google-ace]: Google Cloud, "Agent Compute Engine deep dive." <https://cloud.google.com/blog/topics/ai-infrastructure/agent-compute-engine-deep-dive>
[^okta]: Okta, "Okta brings first-class identity to AI agents with Agent SSO." <https://okta.com/newsroom/press-releases/okta-brings-first-class-identity-to-ai-agents-with-agent-sso/>
[^forkast]: Forkast, "Six vendors are shipping agent identity products; the IETF has not finished the standard." <https://forkast.news/six-vendors-are-shipping-agent-identity-products-the-ietf-has-not-finished-the-standard/>
[^vsr]: vLLM, "vLLM Semantic Router v0.1 Iris: The First Major Release," 5 January 2026. <https://vllm.ai/blog/2026-01-05-vllm-sr-iris>; <https://github.com/vllm-project/semantic-router>
[^llmd]: CNCF, "Welcome llm-d to the CNCF," 24 March 2026. <https://www.cncf.io/blog/2026/03/24/welcome-llm-d-to-the-cncf-evolving-kubernetes-into-sota-ai-infrastructure/>
[^agentgateway]: agentgateway. <https://agentgateway.dev/blog/2026-08-03-new-mcp-spec-revision/>
[^azure-quota]: Microsoft Azure, "The economics of agent optimization." <https://azure.microsoft.com/en-us/blog/the-economics-of-agent-optimization-how-ai-agent-governance-controls-cost-and-proves-roi/>
[^temporal]: Temporal, "Production-ready agents with the OpenAI Agents SDK + Temporal." <https://temporal.io/blog/announcing-openai-agents-sdk-integration>; Temporal docs. <https://docs.temporal.io/develop/python/integrations/openai-agents-sdk>
[^licences]: Forkast, "Durable execution is the next agent infrastructure sub-sector" (Restate under BSL 1.1, Inngest under SSPL 1.0). <https://forkast.news/durable-execution-is-the-next-agent-infrastructure-sub-sector>
[^agentsmd]: Red Hat Developer, "Standardize project context with AGENTS.md and Agent Skills," 27 July 2026. <https://developers.redhat.com/articles/2026/07/27/standardize-project-context-agentsmd-and-agent-skills>; Harness, "The agent-native repo." <https://www.harness.io/blog/the-agent-native-repo-why-agents-md-is-the-new-standard>
[^atlan]: Atlan, "How to choose an agentic framework for the enterprise." <https://atlan.com/know/ai-agent/how-to-choose-agentic-framework-enterprise/>
[^iceberg-vec]: Snowflake Engineering, "Operationalizing Data Interoperability in Multi-Engine Lakehouses." <https://www.snowflake.com/en/blog/engineering/lakehouse-data-interoperability-guide/>
[^otel]: OpenTelemetry, GenAI semantic conventions repository (the conventions moved here from the core semantic-conventions docs). <https://github.com/open-telemetry/semantic-conventions-genai>; Dash0, "OpenTelemetry GenAI semantic conventions explained." <https://www.dash0.com/knowledge/opentelemetry-genai-semantic-conventions-explained>
[^maf]: InfoWorld, "The Microsoft agent framework wars are over; the real architecture decision starts now." <https://www.infoworld.com/article/4199575/the-microsoft-agent-framework-wars-are-over-the-real-architecture-decision-starts-now.html>
[^agenthq]: MarkTechPost, coverage of GitHub Agent HQ (launched February 2026 with Claude and Codex). <https://www.marktechpost.com/2026/06/10/ai-coding-agents-development-platforms-2026/>
[^platforms]: Lines & Circles, "Enterprise Agent Platforms 2026: Gemini, Agentforce, Bedrock." <https://linesncircles.com/Blog/Enterprise/Enterprise_Agent_Platforms_2026>
[^gartner-idp]: Gartner, "Gartner Identifies the Top Strategic Trends in Software Engineering for 2025 and Beyond," 1 July 2025. <https://www.gartner.com/en/newsroom/press-releases/2025-07-01-gartner-identifies-the-top-strategic-trends-in-software-engineering-for-2025-and-beyond>
[^gartner-teams]: Gartner, "Gartner Predicts 60% of Organizations Will Adopt Smaller Software Engineering Teams by 2029," 7 July 2026. <https://www.gartner.com/en/newsroom/press-releases/2026-07-07-gartner-predicts-60-percent-of-organizations-will-adopt-smaller-software-engineering-teams-by-2029>
[^gartner-ide]: Gartner, "Gartner Says the Market for Enterprise AI Coding Agents Is Entering a New Phase of Expansion and Competitive Realignment," 20 May 2026. <https://www.gartner.com/en/newsroom/press-releases/2026-05-20-gartner-says-the-market-for-enterprise-ai-coding-agents-is-entering-a-new-phase-of-expansion-and-competitive-realignment>

<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js"></script>

