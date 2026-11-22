---
layout: post
title: Programming in the Age of AI Slop
author: p6
categories:
- AI
- Software Engineering
- Platform Engineering
image: assets/blog-images/ai-slop-coding-productivity/hero.svg
featured: true
weight: 1
hidden: false
teaser: Code was never the hardest part. With agents writing it, the work that's left
  is proving it right and doing the domain work, one eval at a time.
description: Code was never the hardest part. With agents writing it, the work that's
  left is proving it right and doing the domain work, one eval at a time.
toc: false
---

Since 2023 we have gone through a new meme every year or so about what these machines are.

- **2023, the parrot:** fancy autocomplete, stitching together the form of language without its meaning. The best model resolved 1.96% of real GitHub issues on SWE-bench.[^swe-bench]  The job of the future was *prompt engineer*, and one posting paid up to $335,000.[^prompt-engineer]
- **2025, the vibes:** "a new kind of coding I call 'vibe coding'," where you "forget that the code even exists."[^vibe] In March, Anthropic's CEO expected AI to be writing 90% of the code within three to six months.[^amodei]  The sceptics had their own refrain: it's slop.
- **2026, the factory:** agents running for hours with nobody watching, sixteen of them building a C compiler, leaderboards ranking engineers by tokens burned, and machine-checked proofs offered for Millennium Prize problems.

Each meme was half right, and each aged faster than the last.

* * *

I started programming in my teens. I was good at Scrabble, borderline at chess, and hopeless at Yahoo Pool, with its five-second timed shots and somewhat questionable physics. So I did what any budding script kiddie would: I hacked the Java applet to build an auto-aimer. Result: I won every game.

Then the long road. Lots of web development; learning C, then C++, like a real programmer; lots of competitive programming; a pile of open-source projects. They say that as you get older you think more about infrastructure, and databases. I'll save that for another day.

Was it all worth it, to end up typing to Claude: "Do X, step by step. Make no mistakes"?

The auto-aimer is now the whole profession's default. The line is drawn for you, and nobody has to learn to aim. Peter Naur described what's at stake in 1985. Programming is "the programmers' building up knowledge of a certain kind": a theory of how the problem maps onto the code, which lives in people's heads and "could not conceivably be expressed" in full. A program dies "when the programmer team possessing its theory is dissolved." It keeps running; nobody can change it intelligently.[^naur]

So who holds the theory of a program no human wrote?

* * *

Slop was 2025's word of the year: "digital content of low quality that is produced usually in quantity by means of artificial intelligence."[^mw-slop] The definition is economic. Slop is cheap, plentiful, and someone else's job to clean up.

Writing hurts more than the code. It's the other craft I cultivated, making a story land, and it's disrupted the same way. This essay was drafted with an AI from my notes, then argued with, cut and rewritten. The machine is a good researcher and a tireless first draft. It has nothing to say; that part was mine, and it's the only part worth reading.

Will children growing up now feel what I felt at fourteen, making a machine do something it wasn't meant to, or finding the sentence that says exactly what I meant? The early evidence is thin:

- **Study:** 54 participants writing essays over several months, with ChatGPT, a search engine or nothing (MIT Media Lab preprint, 2025)
- **Unaided writers:** the strongest, most widely distributed brain connectivity
- **ChatGPT writers:** the weakest, and trouble quoting essays they had just written
- **Caveats:** small sample, tight time limits, a preprint[^brain-chatgpt]

It matches what anyone who learned a craft knows: the struggle *is* the skill, laid down in layers. Kids will still learn to aim, the way people still learn chess decades after engines beat the best humans: as a sport and an art. A craft survives as a hobby long after it stops being a trade.

* * *

Then the machines got good. Until late 2025 a coding agent was an eager intern: fast, confident and in need of a minder. Claude Opus 4.5, in November 2025, was the turn. It "runs longer, does more, and requires less intervention," and inside the two-hour limit of Anthropic's performance-engineering take-home it scored higher than any human candidate ever had.[^opus-45]  Within three months agents were building systems:

- **February 2026:** 16 parallel Opus 4.6 agents, nearly 2,000 sessions over two weeks, just under $20,000. The result was a clean-room, 100,000-line C compiler in Rust that builds Linux 6.9 on x86, ARM and RISC-V, plus Postgres, SQLite and Doom, written without active human intervention.[^c-compiler]
- **Task length at 50% success:** about 4.9 hours for Opus 4.5, about 12 hours for Opus 4.6, about 17 hours for an early snapshot of Anthropic's Mythos Preview in April 2026. METR treats anything above 16 hours as unreliable on its suite.[^metr-horizons]
- **Task length at 80% success:** 49 minutes, 70 minutes, about 3 hours.[^metr-horizons]

My conclusion: software engineering for today's requirements is definitively solved. Agents don't need babysitting. They still need checking, and the gap between those two horizons is the work that's left. The compiler's author spent most of his effort "designing the environment around Claude": the tests, the harness, the feedback.[^c-compiler] Its limits are the kind you find by measuring: it borrows GCC to boot 16-bit x86, has no assembler or linker of its own, emits slow code, and its Rust is "nowhere near" expert quality.

Code was never the hardest part.

* * *

A word to the angry artisans, and I was one not long ago. The complaint goes like this: programming was an art, and the shippers of slop have lost it. The daily evidence is real. A 180-file, 40,000-line pull request lands in your review queue, and it happens a lot. Reading it line by line is drudgery, and it catches less than it costs.

My advice: that isn't the way to go, and anything this puritanical is no longer worth preserving. Programming is following the path of everything that became computable. *Computer* was once a job title. At Langley, from 1935, rooms of women with mathematics degrees worked the numbers by hand, graded from Junior Computer to Chief Computer, until the machines took the arithmetic; some of them went on to become engineers and programmers of those machines.[^langley]  Brevity in code was a virtue while people wrote and read every line. It no longer seems worth the effort, unless poetry defines you, and code golf will survive as a sport, like chess.

The new way, in four moves:

- **Adversarial review:** a second agent, told to break the change, reviews it before any human does, and the human reads the disagreements.
- **Better evals:** the 40,000-line pull request is judged against a golden set of real cases, and the diff is the last thing you read.
- **Architecture as a constitution:** the rules the code must obey (layering, dependencies, data ownership, what may touch money) written down, enforced in the build and handed to every agent.
- **The factory as a platform:** [agentic AI run as an enterprise platform](/blog/platform-engineering-3/), with the line built around the agents.

* * *

Production has split into two shapes.

The **software factory** is an old idea. Hitachi pioneered the factory model for large-scale software in the late 1960s, chasing process, reuse and quality control at industrial scale.[^cusumano] The 2026 version is the *dark factory*, named after lights-out plants: the top of a five-level ladder of AI-assisted coding, with rules like "Code must not be written by humans. Code must not be reviewed by humans." Humans write goals, scenarios and hidden acceptance tests; the factory runs.[^dark-factory] Throughput is the product, and code is an intermediate good, like sawdust.

The **tokenmaxxing artisan** is one engineer running a dozen agents, with token spend worn as a badge; some companies now score employees on it.[^wbur] The leverage is real, at a price. Q1 2026, 12,000 developers at 200 companies:[^jellyfish]

- **Lowest-spending fifth:** about $3 of tokens for the quarter, 11 merged PRs
- **Highest-spending fifth:** $1,822, 23 merged PRs
- **Marginal cost:** $$\frac{\$1{,}822 - \$3}{23 - 11} \approx \$150$$ per extra merged PR, less than an hour of a senior engineer

A merged PR measures activity, and both shapes share a blind spot. The factory swaps the person who holds Naur's theory for a test suite. The artisan keeps that person and buries them in more code than one person can hold. Either way the theory thins out, and by Naur's definition the program is born dead.

* * *

Is the gain real? The most careful evidence on delivery:

- **METR, 2025:** randomised trial, 16 experienced open-source developers, 246 tasks in repositories they knew. AI made them 19% *slower*; they had expected 24% faster, and afterwards believed they had been 20% faster.[^metr-2025]
- **METR, late 2025 follow-up:** 57 developers, a speedup estimate with confidence intervals spanning zero, "only very weak evidence." The study is being redesigned, partly because developers now refuse to work without AI.[^metr-2026]
- **DORA 2025 (about 5,000 respondents):** higher AI adoption now tracks higher throughput, and higher delivery *instability*.[^dora-2025]
- **Faros (22,000 developers, two years):** tasks completed up 34%, bugs per developer up 54%.[^faros]

The agents have improved enormously since those trials; the delivery evidence hasn't caught up. The theory of constraints explains why: a system's throughput is set by its bottleneck, and speeding up any other step piles inventory in front of it.[^goldratt] Amdahl's law gives the overall speedup $$S$$ when a step taking share $$p$$ of lead time gets $$k$$ times faster:

$$S = \frac{1}{(1 - p) + p/k}$$

If writing code is 30% of lead time ($$p = 0.3$$; illustrative, measure your own):

- **10× faster coding:** $$S = 1/(0.7 + 0.03) \approx 1.37\times$$ faster delivery
- **Infinitely fast coding:** $$S \to 1/0.7 \approx 1.43\times$$

![If writing code is 30% of lead time, making it ten times faster speeds up delivery by only 1.37 times, and no amount of coding speedup can beat 1.43 times.](../assets/blog-images/ai-slop-coding-productivity/amdahl.svg)

*Illustrative: coding at 30% of lead time.*

The inventory piles up in the review queue, and the cost of a change is more than its tokens:

$$C_{\text{change}} = C_{\text{tokens}} + t_{\text{review}}\, w + P_{\text{defect}}\, C_{\text{defect}} + P_{\text{vuln}}\, C_{\text{breach}} + C_{\text{slop}}$$

where $$t_{\text{review}}$$ is review time, $$w$$ the engineer's rate, and $$C_{\text{slop}}$$ the cost pushed onto someone else. Tokens are the cheap term. The rest:

- **Review.** Code nobody holds a theory of is slower to review than a colleague's.
- **Defects.** 54% more bugs per developer grows the defect term with throughput.
- **Vulnerabilities.** Across 100+ models and 80 tasks built around common weaknesses, generated code introduced a security flaw in 45% of cases, above 70% in Java.[^veracode]
- **Invented dependencies.** Of 2.23 million generated package references, 19.7% named packages that don't exist: 205,000+ unique names, each free for an attacker to register. The attack is called *slopsquatting*.[^package-hallucination]
- **Externalised slop.** curl ended its bug bounty in January 2026, after AI-generated reports pushed valid submissions below 5%; its maintainers had been paying for other people's slop with their evenings.[^curl]

Net: real at the keyboard, smaller at the pull request, and close to zero for teams that don't price in review, defects and security. The business moves at the speed of everything outside the editor: deciding what to build, approvals, legal review, procurement, the customer who has to change how they work. AI speeds up the cheapest link; the chain sets the pace.

* * *

So the engineer becomes the verifier: the person who measures, evals and makes sure the code did what it was supposed to do. Reading every line doesn't scale to a fleet of agents. Demonstrations do, each one measured:

- **Behaviour:** evals on a golden set of real cases, run on every change
- **Types and contracts:** type checkers, schemas, constrained output
- **Architecture:** dependency and layering rules enforced in the build
- **Performance:** benchmarks and load tests as gates, with budgets
- **Security:** scans, pinned and allowlisted dependencies, a threat model for anything that touches money or identity
- **Correctness:** specs, and proofs where they pay

Security is where verification is least optional, because it is an economic property: how much would breaking this cost, and who would pay it? Scarcity used to protect most software. Skilled attackers were expensive, slow and few. Not any more:

- **XBOW, 2025:** an autonomous pentester, 1,000+ vulnerability reports in a few months, top of HackerOne's US leaderboard.[^xbow]
- **DARPA AI Cyber Challenge, August 2025:** autonomous systems found 54 of 63 planted vulnerabilities, patched 43, and found 18 real ones nobody planted.[^aixcc]
- **GTG-1002, November 2025:** an espionage campaign assessed as Chinese state-sponsored used an AI coding agent as an intrusion engine against about thirty targets, with AI doing an estimated 80–90% of the work.[^gtg-1002]

The same capability defends. The asymmetry stays: defenders must be right everywhere, and the attacker's cost per attempt has fallen by orders of magnitude. Code generated quickly, verified thinly and full of plausible dependencies is cheap to break.

Then sign-off. Uber's former chief security officer was convicted in 2022 over the handling of its 2016 breach, believed to be the first criminal prosecution of an executive over a data breach.[^uber-cso] Regulators, courts and boards look for a person with a name. A slide attributed to a 1979 IBM training session put it in sixteen words: "A computer can never be held accountable. Therefore a computer must never make a management decision."[^ibm-1979] Every autonomous pipeline ends at a human signature, and that human owns the outcome, whoever did the execution.

**For engineering leaders**, the moves:

- measure lead time and review-queue age, and stop counting PRs or tokens
- budget verification time explicitly as AI output grows
- pin and allowlist dependencies, and scan every generated change
- require a named human sign-off on anything touching money, identity or production

The cost of the strongest demonstration, a proof, is collapsing:

- **AWS, since 2011:** TLA+ on critical systems, catching design bugs no other technique found.[^aws-tla]
- **December 2025 prediction:** AI will "totally change the economics of formal verification." If a model writes the proof, you trust the checker instead of reading the code, and the work shifts to "correctly defining the specification."[^kleppmann]
- **2025 benchmark, 12,000+ formal specifications:** off-the-shelf models produced verified programs for about 82% of Dafny tasks, 44% in Verus and 27% in Lean.[^vericoding]

Mathematics went first, because there the checker already existed. Lean checks a proof line by line, so a machine's proof can be trusted without trusting the machine:

- **January 2026:** GPT-5.2 Pro and Harmonic's Aristotle, operated by Kevin Barreto, resolved Erdős problem #728 with a formal proof in Lean, the first Erdős problem regarded as resolved autonomously by AI.[^erdos-728]
- **May 2026:** a formal proof-search agent autonomously resolved 9 of 353 open Erdős problems.[^proof-search]
- **September 2026:** OpenAI claimed a resolution of the Navier–Stokes Millennium Prize problem, a finite-time singularity from smooth initial data, found by about 10,000 concurrent agents in 88 hours and formalised in Lean. Mathematicians are still checking it, and the Clay Institute rules only after peer review and a two-year wait.[^navier-stokes]
- **November 2026:** Terence Tao reported Lean-formalised proofs of finite-time blowup for the unforced Euler and Navier–Stokes equations by Levent Alpöge and colleagues, with heavy AI assistance.[^tao-grh]  A day later the Lean and Mathlib communities certified a proof of the Riemann Hypothesis by Alpöge, generated with an internal AI model:[^tao-grh] a Lean library of 17 million lines.[^rh-lean]

The people in those stories chose the problem, built the setup and checked the result.

That points to a meta-language for the rest of us. Spec-driven development is its first draft: tools that have the agent write requirements, a design and a task list before any code, and hold it to them.[^sdd]  Push it further and the roles move with it:

- **Product managers** writing acceptance criteria as conjectures, statements precise enough for a machine to try to prove or refute
- **Verification engineers** writing torture suites in the style of GCC's, the suite the agents' C compiler had to pass[^c-compiler]
- **Platform teams** throwing deterministic simulation and fuzzing at all their infrastructure; FoundationDB was built inside a simulator from the start, and ran the equivalent of a trillion CPU-hours of simulated stress tests[^fdb]

The first is speculative. The other two are how the most reliable systems were already built.

* * *

Larry Page made a prediction at the American Association for the Advancement of Science in 2007: when AI happens, "it's going to be a lot of computation, and not so much clever blackboard, whiteboard kind of stuff."[^page]  He was right, and you can see it in the output. What computation finds tends to be exhaustive: it covers every case where a person would have spotted the shortcut.

- **Writing:** a lack of brevity is the typical AI smell; the extra clause, the recap, three examples where one would do.
- **Code:** way more verbose than the best programmers write it.
- **Mathematics,** ironically, the purest form: the Riemann Hypothesis proof is 17 million lines of Lean, and digesting it will "take some time."[^tao-grh]

Do we really learn much from AI? Machines checked those 17 million lines within a day of their release. The Lean community's own announcement ends by looking forward to mathematicians explaining the new ideas in them.[^rh-lean] The prices around the oldest gap in computer science, between finding an answer and checking one (P versus NP, which AI hasn't settled), now look like this:

- **Finding:** cheap, bought with computation.
- **Checking:** cheap wherever a checker exists: Lean for proofs, tests and evals for code.
- **Understanding:** still human, and still expensive.

That reconciles brevity with my advice to the artisans. Verbose code is a fair price where a machine checks it and nobody has to read it. Where a person has to understand the result (a post, a proof, the theory of a program) verbosity is a cost, and somebody has to pay it down.

* * *

AI raises the bar twice: for what customers expect, and for the engineers who deliver it.

The fashionable obituary says software is dead: models write the code and the profession deflates. Jevons saw the opposite with coal in 1865: more efficient engines made coal worth burning for more things, and consumption rose.[^jevons] Cheaper code does the same to software, and customer service shows the two ways to spend it.

- **Klarna, February 2024:** its AI assistant handled two-thirds of customer-service chats in its first month, the work of 700 full-time agents by its own count.[^klarna-2024] By May 2025 the focus was back on the quality of human support.[^klarna-2025]
- **Air Canada, February 2024:** ordered to honour a bereavement-fare policy its chatbot invented, after arguing it wasn't liable for what the chatbot said. Damages: $812.02.[^air-canada]
- **The other way:** the agent spots the delayed shipment before the customer does, rebooks the connection when the inbound flight slips, and files the claim with documents attached. Everyone gets the platinum tier, which takes more software and harder software: real integrations, idempotent writes, audit trails, a designed hand-off to a person.

If an AI plan's headline metric is something you remove (headcount, handle time, tickets reaching a human), you're competing on price with everyone who bought the same model. If it's something nobody could afford to offer last year, you have a product.

The engineer's bar rises with it. Verifying an agent's work takes the judgment that used to come from years of writing the code yourself, and the entry rungs are thinning: workers aged 22 to 25 in the most AI-exposed occupations saw a 16% relative decline in employment from late 2022, after controlling for firm-level shocks, with software developers among the hardest hit.[^canaries]  Experience is now the expensive input, and the industry will have to find new ways to grow it.

* * *

The next round of work is domain work, and it will be eval-driven. "Stochastic parrots" (2021): systems that stitch together linguistic form without reference to meaning.[^parrots] Half right, and the half that matters is that fluency is no evidence of correctness. A million monkeys at a million typewriters would eventually produce *Hamlet*; give one monkey a crossword, where every crossing is a check, and the odds change. Levelling up an industry means drawing its crosswords: the evals that say what correct means in claims handling, freight, lending or care.

The roles are already on job boards:

- **Forward-deployed engineers:** embedded with a customer, building the integrations and workflows that put a model into production. Monthly listings grew more than 800% from January to September 2025.[^fde]
- **Expert trainers:** professionals paid to write, grade and critique model outputs in their own field. Mercor, one marketplace, says it hired 30,000 contractors in 2025, from finance analysts to linguists, and pays out about $2 million a day.[^mercor]
- **Environment builders:** engineers who build simulated workspaces where agents practise multistep tasks and are rewarded for finishing them; labs buy them from a new crop of startups.[^rl-envs]
- **Eval writers:** domain experts who label a golden set of real cases and run it on every prompt change and model upgrade, the unit tests for judgment.
- **Harness designers:** narrow verbs like `issue_refund(order_id, amount)` with the cap enforced in code, and crossings: schemas, rule engines, a second model, reconciliation against the system of record.
- **Operators who still fly:** on Air France 447 in 2009, the autopilot disconnected when ice blocked the airspeed probes and handed a sound aircraft to a crew that never recognised the stall.[^af447] Agents will take diagnosis and most remediation; someone who has flown recently holds the pager.

Most of these are *software engineering applied to X*, and most of the job is X. Frameworks turn over every eighteen months; a domain lasts a career.

The engineer who thrives there is T-shaped with a broader bar: one deep stroke, and a bar wide enough to reach architecture, security, performance and the business. A polymath helps; breadth and taste are the requirement. AI supplies some of the breadth itself. In a field experiment with 776 Procter & Gamble professionals, R&D and commercial staff using AI produced proposals balancing technical and commercial elements whatever their background, and individuals with AI matched two-person teams without it.[^cybernetic]  What stays scarce is taste: knowing which domains should meet, and noticing when the combination is wrong.

* * *

Those engineers will run an increasingly bespoke software world. When building is cheap, the thin layer of SaaS turns out brittle: the workflow tool, the admin panel, the dashboard, the CRM nobody loved. In one 2026 survey of 817 builders, 35% had already replaced at least one SaaS tool with a custom build, mostly workflow automations, internal admin tools, BI and CRMs.[^retool]  The software stocks felt it in February 2026, and partly recovered by May.

What holds is software that is very cheap, wins on scale, provides real security, or is the system of record. The infrastructure primitives get more defensible still: PostgreSQL, Kafka, Kubernetes, Linux, identity, durable execution. Their value is correctness under failure, learned through decades of incidents, and agents are their most demanding clients yet: tireless, parallel, retry-happy and wrong in untested ways. A 30-step agent loop resends its history every step, close to a million input tokens for one support ticket, and at 98% per-step reliability it finishes cleanly about 55% of the time. It needs idempotency keys on every write, per-agent quotas, durable workflows that survive a crash at step 23, an append-only log of every action, and a router that sends each step to the cheapest capable model.[^frugalgpt] (We build these systems for customers, so we have a stake in this.)

A bespoke world multiplies programs, and by Naur's definition a program whose theory nobody holds is born dead. Naur said the theory can never be fully written down. Its most important part can: the invariants and the evals. *Balances never go negative. Every message is delivered at least once. No user reads another tenant's data.* The evals are the part of the theory that survives the team. People own the spec, the evals and the signature; machines own the middle. When code is cheap and everyone has the aimer, the scarce skill is calling the pocket before the shot.

For all of that, AI is still a stochastic parrot, a far better one, and we're all training parrots, more or less: every eval, golden set and harness is a lesson. The next ones may be categorical parrots. Jev, from TypeSafe AI, never writes prose: it answers typed questions (true or false, a choice, a score) with probabilities its makers train to be calibrated, for software to act on, and it is named after Jevons, on the bet that cheaper judgment means far more of it.[^jev]  A parrot that answers in categories, with its confidence attached, is one you can check. The right tools in the right hands still make the difference, and the human edge shows in all the path-breaking work above. A person operated the system that resolved Erdős #728. A person built the harness that let sixteen agents write a compiler. People chose Navier–Stokes and the Riemann Hypothesis, and people are now digesting the proofs.

So, was it worth it? The auto-aimer won me every game, and taught me the lesson that still applies: to bend a system, you first have to understand it. The machines draw every line now. Somebody still has to know where the ball needs to go, and put their name on the shot.

[^naur]: Peter Naur, "Programming as Theory Building," *Microprocessing and Microprogramming* 15 (1985), pp. 253–261. <https://pages.cs.wisc.edu/~remzi/Naur.pdf>
[^mw-slop]: Merriam-Webster, "2025 Word of the Year: Slop," December 2025. <https://www.merriam-webster.com/wordplay/word-of-the-year>
[^brain-chatgpt]: Nataliya Kosmyna et al., "Your Brain on ChatGPT: Accumulation of Cognitive Debt when Using an AI Assistant for Essay Writing Task," MIT Media Lab, arXiv:2506.08872, June 2025 (preprint, not peer-reviewed). <https://www.media.mit.edu/publications/your-brain-on-chatgpt/>
[^cusumano]: Michael A. Cusumano, *Japan's Software Factories: A Challenge to U.S. Management*, Oxford University Press, 1991. <https://academic.oup.com/book/52424>; on Hitachi specifically, Cusumano, "Hitachi: pioneering the 'factory' model for large-scale software development," MIT Sloan working paper 1886-87, 1987. <https://dspace.mit.edu/handle/1721.1/48050>
[^dark-factory]: On Dan Shapiro's five levels and StrongDM's no-human-written, no-human-reviewed rules, as summarised in *Encyclopedia of Agentic Coding Patterns*, "Dark Factory." <https://aipatternbook.com/dark-factory>
[^wbur]: WBUR *On Point*, "Why the tech world is 'tokenmaxxing'," 28 April 2026. <https://www.wbur.org/onpoint/2026/04/28/tokenmaxxing-how-tech-workers-are-gamifying-their-way-to-unemployment>
[^jellyfish]: Jellyfish, "Is 'tokenmaxxing' cost effective? New data from Jellyfish explains," 15 April 2026 (Q1 2026, 12,000 developers, 200 companies). <https://jellyfish.co/blog/is-tokenmaxxing-cost-effective-new-data-from-jellyfish-explains/>
[^metr-2025]: METR, "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity," 10 July 2025; arXiv:2507.09089. <https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/>
[^metr-2026]: METR, "We are Changing our Developer Productivity Experiment Design," 24 February 2026. <https://metr.org/blog/2026-02-24-uplift-update/>
[^goldratt]: Eliyahu M. Goldratt, *The Goal* (1984), the origin of the theory of constraints. <https://en.wikipedia.org/wiki/Theory_of_constraints>
[^dora-2025]: Google Cloud DORA, *2025 State of AI-assisted Software Development*, September 2025, as summarised by InfoQ. <https://www.infoq.com/news/2025/09/dora-state-of-ai-in-dev-2025>; report: <https://services.google.com/fh/files/misc/2025_state_of_ai_assisted_software_development.pdf>
[^faros]: Faros AI, "Tokenmaxxing: Why token consumption isn't AI engineering productivity," 23 April 2026 (two years of data, 22,000 developers, 4,000 teams). <https://www.faros.ai/blog/tokenmaxxing>
[^veracode]: Veracode, "AI-Generated Code Poses Major Security Risks in Nearly Half of All Development Tasks," 30 July 2025 (2025 GenAI Code Security Report). <https://www.veracode.com/press-release/ai-generated-code-poses-major-security-risks-in-nearly-half-of-all-development-tasks-veracode-research-reveals/>
[^package-hallucination]: Joseph Spracklen et al., "We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs," USENIX Security 2025, as reported by SecurityWeek. <https://www.securityweek.com/ai-hallucinations-create-a-new-software-supply-chain-threat/>
[^curl]: Daniel Stenberg, "The end of the curl bug-bounty," 26 January 2026. <https://daniel.haxx.se/blog/2026/01/26/the-end-of-the-curl-bug-bounty/>
[^xbow]: XBOW, "XBOW tops US leaderboard on HackerOne," June 2025; see also *CSO Online*, "The top red teamer in the US is an AI bot." <https://www.csoonline.com/article/4012801/the-top-red-teamer-in-the-us-is-an-ai-bot.html>
[^aixcc]: DARPA, "AI Cyber Challenge results," 8 August 2025. <https://darpa.mil/news/2025/aixcc-results>
[^gtg-1002]: Anthropic, "Disrupting the first reported AI-orchestrated cyber espionage campaign," 13 November 2025 (attribution is Anthropic's high-confidence assessment). <https://www.anthropic.com/news/disrupting-AI-espionage>
[^uber-cso]: CBS News, "Former Uber security chief sentenced for data-breach cover-up," 4 May 2023 (conviction October 2022). <https://www.cbsnews.com/sanfrancisco/news/former-uber-security-chief-sentenced-data-breach-cover-up/>
[^aws-tla]: Chris Newcombe et al., "How Amazon Web Services Uses Formal Methods," *Communications of the ACM* 58(4), April 2015. <https://cacm.acm.org/magazines/2015/4/184701-how-amazon-web-services-uses-formal-methods/fulltext>
[^kleppmann]: Martin Kleppmann, "Prediction: AI will make formal verification go mainstream," 8 December 2025. <https://martin.kleppmann.com/2025/12/08/ai-formal-verification.html>
[^vericoding]: Sergiu Bursuc et al., "A benchmark for vericoding: formally verified program synthesis," arXiv:2509.22908, September 2025. <https://arxiv.org/abs/2509.22908>
[^frugalgpt]: Lingjiao Chen, Matei Zaharia and James Zou, "FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance," arXiv:2305.05176, 2023. The 98% figure is the authors' result on their benchmarks. <https://arxiv.org/abs/2305.05176>
[^jevons]: W. Stanley Jevons, *The Coal Question*, 1865. The effect is now known as the Jevons paradox. <https://en.wikipedia.org/wiki/Jevons_paradox>
[^klarna-2024]: Klarna, "Klarna AI assistant handles two-thirds of customer service chats in its first month," press release, 27 February 2024, as reproduced by CIO Dive. <https://www.ciodive.com/news/klarna-generative-ai-customer-service-call-center/709916/>
[^klarna-2025]: Tech.co, "Klarna Reverses AI Customer Service Overhaul," 20 May 2025, reporting Sebastian Siemiatkowski's interview with Bloomberg. <https://tech.co/news/klarna-reverses-ai-overhaul>
[^air-canada]: *Moffatt v. Air Canada*, 2024 BCCRT 149, British Columbia Civil Resolution Tribunal, 14 February 2024; damages, interest and fees totalled $812.02. Summary by Dunphy Best Blocksom. <https://www.dww.com/articles/bc-tribunal-finds-air-canada-liable-for-inaccurate-advice-given-by-website-chatbot>
[^parrots]: Emily M. Bender, Timnit Gebru, Angelina McMillan-Major and Shmargaret Shmitchell, "On the Dangers of Stochastic Parrots: Can Language Models Be Too Big?," *FAccT '21*, 2021. <https://dl.acm.org/doi/10.1145/3442188.3445922>
[^af447]: BEA (Bureau d'Enquêtes et d'Analyses), final report on Air France 447, July 2012, as summarised by *IEEE Spectrum*, 10 July 2012. Full report: <https://www.faa.gov/sites/faa.gov/files/f-cp090601.en_.pdf>; summary: <https://spectrum.ieee.org/riskfactor/aerospace/aviation/air-france-flight-447-crash-caused-by-a-combination-of-factors>
[^ibm-1979]: Widely attributed to a 1979 IBM internal training slide, first shared online in February 2017. IBM's archives have not located the original, which was reportedly destroyed in a flood. Simon Willison, "A computer can never be held accountable," 3 February 2025. <https://simonwillison.net/2025/Feb/3/a-computer-can-never-be-held-accountable/>
[^fde]: PYMNTS, "Forward-Deployed Engineers Emerge as One of AI's Fastest-Growing Jobs," 10 March 2026, citing the *Financial Times* (monthly listings up more than 800%, January to September 2025). <https://www.pymnts.com/artificial-intelligence-2/2026/forward-deployed-engineers-emerge-as-one-of-ais-fastest-growing-jobs/>
[^mercor]: Jake Angelo, *Fortune*, 13 January 2026 (a Mercor spokesperson on 30,000 contractors hired in 2025; the company's claim of about $2 million paid to experts daily). <https://fortune.com/2026/01/13/will-ai-take-my-job-or-human-skills-protect-me-mercor-training-self-made-billionaires/>
[^opus-45]: Anthropic, "Introducing Claude Opus 4.5," 24 November 2025. The take-home result used parallel test-time compute; without a time limit the model matched the best-ever human candidate. Anthropic notes the exam doesn't test collaboration or communication. <https://www.anthropic.com/news/claude-opus-4-5>
[^c-compiler]: Nicholas Carlini, "Building a C compiler with a team of parallel Claudes," Anthropic Engineering, 5 February 2026. <https://www.anthropic.com/engineering/building-c-compiler>
[^metr-horizons]: METR, "Task-Completion Time Horizons of Frontier AI Models" (Time Horizon 1.1; last updated 8 September 2026). 95% intervals are wide: about 5 to 61 hours for Opus 4.6's 50% horizon. <https://metr.org/time-horizons/>; data: <https://metr.org/assets/benchmark_results_1_1.yaml>
[^cybernetic]: Fabrizio Dell'Acqua et al., "The Cybernetic Teammate: A Field Experiment on Generative AI Reshaping Teamwork and Expertise," NBER Working Paper 33641, April 2025; published in *Organization Science*, 2026. <https://www.nber.org/papers/w33641>
[^erdos-728]: Nat Sothanaphan, "Resolution of Erdős Problem #728: a writeup of Aristotle's Lean proof," arXiv:2601.07421, January 2026. <https://arxiv.org/abs/2601.07421>
[^proof-search]: George Tsoukalas et al., "Advancing Mathematics Research with AI-Driven Formal Proof Search," arXiv:2605.22763, May 2026. <https://arxiv.org/abs/2605.22763>
[^tao-grh]: Terence Tao, "Unforced Euler singularity, unforced Navier-Stokes singularity, and the Generalized Riemann Hypothesis," 20 November 2026 (Tao describes the AI-generated proof as one of the Generalized Riemann Hypothesis). <https://terrytao.wordpress.com/2026/11/20/unforced-euler-singularity-unforced-navier-stokes-singularity-and-the-generalized-riemann-hypothesis/>
[^rh-lean]: Lean and Mathlib communities, "Lean verification of the Riemann Hypothesis," 21 November 2026. <https://leanprover-community.github.io/blog/posts/riemann-hypothesis/>
[^page]: Larry Page, talk at the American Association for the Advancement of Science, 2007, as transcribed in "How Larry Page had correctly predicted in 2007 that increased computation instead of clever algorithms would lead to AI progress," OfficeChai, 20 April 2026. <https://officechai.com/ai/how-larry-page-had-correctly-predicted-in-2007-that-increased-computation-instead-of-clever-algorithms-would-lead-to-ai-progress/>
[^navier-stokes]: OpenAI, "On the Navier–Stokes Millennium Prize Problem," 8 September 2026 (claims statements C and D of the official problem; Lean formalisation published). Verification status and the Clay Institute's rules: Wikipedia, "Millennium Prize Problems". <https://openai.com/index/navier-stokes-solution/>; <https://en.wikipedia.org/wiki/Millennium_Prize_Problems>
[^rl-envs]: TechCrunch, "Silicon Valley bets big on 'environments' to train AI agents," 16 September 2025. <https://techcrunch.com/2025/09/16/silicon-valley-bets-big-on-environments-to-train-ai-agents/>
[^swe-bench]: Carlos E. Jimenez et al., "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?," arXiv:2310.06770, October 2023 (Claude 2, with BM25 retrieval). <https://arxiv.org/abs/2310.06770>
[^prompt-engineer]: Bloomberg, "\$335,000 Pay for 'AI Whisperer' Jobs Appears in Red-Hot Market," 29 March 2023 (an Anthropic "prompt engineer and librarian" listing). <https://www.bloomberg.com/news/articles/2023-03-29/ai-chatgpt-related-prompt-engineer-jobs-pay-up-to-335-000>
[^vibe]: Andrej Karpathy on X, 2 February 2025; Collins Dictionary made *vibe coding* its 2025 word of the year. <https://knowyourmeme.com/memes/vibe-coding>
[^amodei]: Dario Amodei at the Council on Foreign Relations, 10 March 2025, as reported by *Fortune*, 13 March 2025. <https://fortune.com/2025/03/13/ai-transforming-software-development-jobs-meta-ibm-anthropic/>
[^canaries]: Erik Brynjolfsson, Bharat Chandar and Ruyu Chen, "Canaries in the Coal Mine? Six Facts about the Recent Employment Effects of Artificial Intelligence," Stanford Digital Economy Lab, revised November 2025 (ADP payroll data). <https://digitaleconomy.stanford.edu/publications/canaries-in-the-coal-mine>
[^retool]: Retool, "The build vs. buy shift," 2026 survey of 817 builders (Retool sells tools for building internal software). <https://retool.com/blog/ai-build-vs-buy-report-2026>
[^langley]: Sarah McLennan and Mary Gainer, "When the Computer Wore a Skirt: Langley's Computers, 1935–1970," NASA History. <https://www.nasa.gov/history/when-the-computer-wore-a-skirt-langleys-computers-1935-1970/>
[^sdd]: GitHub, "Spec-driven development with AI: Get started with a new open source toolkit" (Spec Kit), September 2025; AWS's Kiro IDE, July 2025, works from requirements, design and task files. Compared in Birgitta Böckeler, "Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl," martinfowler.com. <https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/>; <https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html>
[^fdb]: Simon Willison, notes on FoundationDB's simulation testing, 13 February 2024; Pierre Zemb, *The FoundationDB Book*, "Correct and robust, choose both". <https://simonwillison.net/2024/Feb/13/foundationdb/>; <https://pierrez.github.io/fdb-book/meet_fdb/correctess.html>
[^jev]: TypeSafe AI, "Introducing System One Models & Jev," September 2026; Rashi Shrivastava, "This \$200 Million Startup Wants To Fix AI's Overconfidence Problem," *Forbes*, 15 September 2026; summarised in Wikipedia, "Jev (AI model)". Architecture and training details are unpublished. <https://typesafe.ai/blog/introducing-system-one-models-and-jev>; <https://en.wikipedia.org/wiki/Jev_(AI_model)>

<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js"></script>

