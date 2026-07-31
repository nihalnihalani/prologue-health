# Market & Clinical Evidence

*Every figure below verified against a primary or authoritative source, with links. Figures that could not be verified are marked and excluded from the pitch.*

---

## The clinical case for pre-visit

| Finding | Source |
|---|---|
| Physicians interrupt the patient's opening statement after a mean of **18 seconds**; patients complete it uninterrupted in only **23%** of visits; interrupted concerns are almost never revisited (1 of 52 interviews) | [Beckman & Frankel, 1984](https://pmc.ncbi.nlm.nih.gov/articles/PMC1783704/) — seminal, 1,115+ citations |
| Average PCP face time **~18 minutes**; ~1 in 4 visits under 12 min | [Medical Care analysis, 21M+ visits](https://www.healio.com/news/primary-care/20210121/average-primary-care-exam-lasts-less-than-20-minutes) |
| **~2 hours of EHR/desk work per 1 hour of face time**, plus 1–2 more after hours | [Sinsky et al., *Annals of Internal Medicine*](https://www.acpjournals.org/doi/10.7326/M16-0961) |
| Family physicians average **86 minutes of nightly "pajama time"** | [AMA](https://www.ama-assn.org/practice-management/digital-health/family-doctors-spend-86-minutes-pajama-time-ehrs-nightly) |
| **"Doorknob phenomenon"** is real and studied — priority concerns raised at the end; unvoiced concerns associated with worsening symptoms, more anxiety, more follow-up visits | [AAFP review](https://www.aafp.org/pubs/afp/issues/2018/0701/p52.html), [PMC5803466](https://pmc.ncbi.nlm.nih.gov/articles/PMC5803466/) |

## Medication history — the strongest evidence in this document

| Finding | Source |
|---|---|
| Up to **67% of inpatients have at least one error** in their admission medication history; nearly two-thirds have an unexplained discrepancy; ~1.4 unintentional discrepancies per patient with harm potential | [PMC2518028](https://pmc.ncbi.nlm.nih.gov/articles/PMC2518028/) |
| **91.07% of discrepancies are omissions** (then incorrect dosage 4.46%, incorrect interval 2.68%). Most potential-harm events trace to errors **in taking the medication history**, not downstream reconciliation logic | same |
| Preventable ADE rates: **16% standard care vs 9.1% with intervention** | same |
| Canonical multi-site QI study: **MARQUIS** | [PMC3698100](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3698100/) |

**Why this is the anchor stat:** the defect is at the *"ask the patient what they actually take"* step. That is a **conversational interviewing problem**, which is precisely what this product is.

## Patient comprehension and equity

| Finding | Source |
|---|---|
| Patients recall ~**49%** of decisions/recommendations; prompting recovers 36%; ~15% never recalled correctly. **38% recall without a HS diploma vs 65% with a college degree** | [Brown University study](https://www.techtarget.com/patientengagement/news/366585219/Patient-Recall-Suffers-as-Patients-Remember-Half-of-Health-Info) |
| Only **12% of US adults have proficient health literacy**; ~36% basic or below. Below-Basic: 9% White, 41% Hispanic, 25% Native American, 24% Black, 13% Asian; 53% of adults without a HS diploma | [NAAL](https://nces.ed.gov/naal/health_results.asp), [AHRQ](https://www.ahrq.gov/sites/default/files/wysiwyg/health-literacy/dhhs-2008-issue-brief.pdf) |
| Estimated economic cost of low health literacy: **$106B–$238B/year** (7–17% of personal health spend) | AHRQ |

*A text-heavy intake form is a comprehension tax levied on exactly the patients least able to afford it. This is also why we measure **question-depth parity across ASR-confidence bands** — an agent that asks less of harder-to-understand patients reproduces the disparity.*

---

## Competitive landscape

### Digital intake — the market is **forms**, not conversation

| Company | Scale / evidence | Voice? Adaptive? |
|---|---|---|
| **Phreesia** (NYSE: PHR) | **~170M patient visits in 2024 — "1 in 7 visits across the U.S."**; 4,700+ healthcare orgs | Kiosks, tablets, digital forms, payments. **No conversational voice or adaptive clinical interviewing** |
| **Luma Health** | SMS/email intake forms; "LumaBot" conversational AI | Scope is scheduling/reminders/logistics — not clinical symptom interviewing |
| **Notable Health** | AI agents for scheduling, registration, intake, referrals | Access/ops automation, omnichannel voice+SMS — not clinical interviewing |
| **Klara** (ModMed) | Text-based intake eForms, syncs to athenahealth | Explicitly form-based, no voice |
| **Yosi Health** | Digital forms, insurance card photo, PDF to EMR | No voice, no adaptive interview |

**Verdict:** the incumbent intake market is branching *forms* (conditional checkbox logic) delivered via portal/SMS, with voice bolted on only for scheduling logistics. **No evidence anyone has shipped conversational adaptive voice clinical interviewing pre-visit.**

Sources: [Phreesia IR](https://ir.phreesia.com/news/news-details/2025/Phreesia-Announces-First-Quarter-Fiscal-2026-Results/default.aspx), [Phreesia about](https://www.phreesia.com/company/about-us/), [LumaBot](https://www.lumahealth.io/newsroom/press-releases/luma-health-announces-lumabot/), [Notable](https://www.notablehealth.com/use-cases/access), [Klara](https://businesswire.com/news/home/20240501205953/en/Klara-Transforms-Patient-Intake-Processes-for-athenahealth-Users), [Yosi](https://yosi.health/digital-patient-intake-forms-yosis-expert-solution-for-seamless-check-ins/)

### Symptom checkers — a hard, published accuracy ceiling

| Finding | Source |
|---|---|
| **Semigran, BMJ 2015** (canonical benchmark, 45 vignettes): correct first diagnosis in only **34%**; top-3 in 51% | [ref](https://www.semanticscholar.org/paper/Evaluation-of-symptom-checkers-for-self-diagnosis-Semigran-Linder/f7b90d0542b9f1319815a722c013e4090e5ac645) |
| Head-to-head: top-3 accuracy **Ada 70.5%, Buoy 43.0%, K Health 36.0%** vs **GP 82.1%**. Ada's safe-triage rate 97.0% matched GPs | [PMC7745523](https://pmc.ncbi.nlm.nih.gov/articles/PMC7745523/) |
| Systematic review: primary-diagnosis accuracy ranges **19–37.9%**; triage accuracy 48.8–90.1%; one 2020 cohort **missed >40% of emergencies** | [PMC9385087](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9385087/) |
| **Clearstep** claims >95% triage-routing accuracy vs an ER-doctor panel — ⚠️ vendor-published, methodology and independence unclear | [Clearstep](https://www.clearstep.health/blog/how-ai-patient-triage-is-improving-accuracy-and-efficiency-in-healthcare) |
| **Gyant** was acquired by Fabric Health, Jan 31 2024 (not defunct) | [Fabric](https://www.fabrichealth.com/press/fabric-acquires-gyant) |

### ⚠️ Babylon Health — the cautionary tale to prepare for

Public 2021 via SPAC at **$3.5B**. Take-private with MindMaze collapsed Aug 2023. **Chapter 7 bankruptcy Aug 9, 2023**, liabilities $100M–$500M, 94 laid off, care abruptly ended for **2.8M users** (Babyl Rwanda). Proximate trigger: insurer **Centene — ~half of 2022 revenue — declined to renew**.

Widely attributed to (a) **over-claiming AI triage/diagnostic capability** relative to demonstrated accuracy, and (b) **single-payer-contract dependency**.

Sources: [Healthcare Dive](https://www.healthcaredive.com/news/Babylon-Chapter-7-bankruptcy/691218/), [TechCrunch](https://techcrunch.com/2023/08/31/the-fall-of-babylon-failed-tele-health-startup-once-valued-at-nearly-2b-goes-bankrupt-and-sold-for-parts/)

**A judge may raise this cold. Have the answer ready** — we make zero diagnostic claims and sell into clinic intake, not a payer risk pool.

### Healthcare voice agents (2025–26) — funded, and uniformly access-layer

| Company | Funding | Scope |
|---|---|---|
| **Assort Health** | **$120M Series C, $222M total, $1.2B valuation** | Scheduling, reminders, eligibility verification, intake, refills, after-hours. Call-center automation |
| **Hyro** | $45M strategic, $95M total; 45+ health systems, 30M+ patients | Scheduling, refills, coverage checks |
| **Hello Patient** | $22.5M Series A (Sept 2025), $29M total | Patient communications automation |
| **Parakeet Health** | $3M seed (Oct 2024) | AI voice call center |

**Pattern:** this wave competes on **call-center economics** — abandonment rate, wait time, first-call resolution. **None claims clinical pre-visit symptom interviewing.**

Sources: [Assort](https://www.fiercehealthcare.com/ai-and-machine-learning/assort-health-scores-120m-series-c-scale-voice-ai-agent-platform-healthcare), [Hyro](https://www.prnewswire.com/news-releases/hyro-raises-45m-strategic-growth-round-to-accelerate-ai-agent-adoption-in-healthcare-302589268.html), [Hello Patient](https://www.fiercehealthcare.com/health-tech/hello-patient-secures-225m-investors-bet-ai-voice-agent-growth), [Parakeet](https://www.fiercehealthcare.com/ai-and-machine-learning/parakeet-expands-ai-call-center-announces-3m-seed-round)

### Ambient scribes — the chart, but too late

Abridge (~30% share, Best-in-KLAS 2025 **and** 2026, 300+ health systems), Ambience (~13%), Suki (~10%), Freed (~4%), Nabla (~4%).

**Two adjacent moves to know about:**
- **Abridge + Availity** (Jan 2026) — real-time prior authorization at the point of conversation
- **Cohere Health + Microsoft Dragon Copilot** (Oct 2025) — ambient listening triggers agents to submit care requests with real-time payer feedback **during the visit**

⚠️ **Do not claim blue ocean on in-visit ambient + payer action.** It's occupied.

Abridge's public CDS position is that they **deliberately avoid interruptive alerts** because of alert fatigue, surfacing insights in-flow instead.

### Dermatology — the regulatory line

| Product | Status |
|---|---|
| **DermaSensor** | **FDA De Novo, Jan 17 2024** — first AI device cleared for skin cancer detection in primary care. ⚠️ **Spectroscopy hardware used by a clinician on a lesion**, not a photo classifier. Mayo trial: 96% sensitivity vs 83% PCPs unaided |
| **Aysa, First Derm, SkinVision, Miiskin** | **None are FDA-cleared devices** — positioned as "educational/wellness" specifically to stay outside device regulation |

**Read for a hackathon:** a photo "documentation aid" that organizes what the patient reports stays non-device. **The moment it outputs "this looks like melanoma" or a risk score, it's a regulated device.**

Sources: [MedTech Dive](https://www.medtechdive.com/news/dermasensor-fda-clearance-ai-skin-cancer-detection-device/704857/), [npj Digital Medicine](https://www.nature.com/articles/s41746-024-01161-1), [PMC11252620](https://pmc.ncbi.nlm.nih.gov/articles/PMC11252620/)

---

## Cost transparency — why we don't promise a number

| Finding | Source |
|---|---|
| Industry cost-estimator accuracy **fell from 78% (2022) to 71% (2025)** — getting worse | Experian State of Patient Access, via [MDClarity](https://www.mdclarity.com/blog/patient-payment-estimator) |
| A well-designed real-time benefit tool reached **83.9%** accuracy (within $10 or 5%) — near best case | [AJMC](https://www.ajmc.com/view/implementation-and-cost-validation-of-a-real-time-benefit-tool) |
| CMS Hospital Price Transparency (CY2026 OPPS final rule, effective Jan 1 2026, **enforcement delayed to April 1, 2026**) now requires actual dollar amounts in MRFs | [CMS](https://www.cms.gov/newsroom/fact-sheets/cy-2026-opps-ambulatory-surgical-center-final-rule-hospital-price-transparency-policy-changes) |
| **70%** of people with an unaffordable bill didn't know their provider was out-of-network | [KFF/Peterson](https://www.healthsystemtracker.org/brief/an-examination-of-surprise-medical-bills-and-proposals-to-protect-consumers-from-them-3/) |

**Structural reasons estimates are unreliable:** outdated fee schedules, missing modifiers, uncaptured secondary insurance, PBM non-participation, mid-year benefit changes.

**Honest ceiling:** a tool can say *"here is a range based on your plan's negotiated rate and your current deductible status."* It **cannot** promise a final out-of-pocket number.

---

## Prior authorization (context — not buildable in test mode)

| Finding | Source |
|---|---|
| **39 prior auths per physician per week, ~13 hours** of physician+staff time; **40%** employ staff whose sole job is PA | [AMA 2024 survey, n=1,000](https://www.ama-assn.org/practice-management/prior-authorization/fixing-prior-auth-nearly-40-prior-authorizations-week-way) |
| Only **35% of medical prior auths are fully electronic** vs **96% of eligibility checks** | [CAQH 2024 Index](https://www.caqh.org/hubfs/Index/2024%20Index%20Report/CAQH_IndexReport_2024_FINAL.pdf) |
| **Prior-auth failures = 34% of first-pass denials**, up from 22% in 2023. **86% of denials avoidable** | [Experian 2025, via Aptarro](https://www.aptarro.com/insights/us-healthcare-denial-rates-reimbursement-statistics) |
| **CMS-0057-F**: decision timelines (72hr urgent / 7 day standard) live **Jan 1 2026**; payer FHIR APIs required **Jan 1 2027** | [CMS](https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/policies-regulations/cms-interoperability-prior-authorization-final-rule-cms-0057-f) |

⚠️ **Retained as roadmap context only — Stedi test mode does not support 278.**

---

## Where the white space is

**Crowded — don't claim novelty:**
- Digital intake forms (saturated, well-funded, deeply EHR-integrated)
- Access-layer voice AI (Assort $222M, Hyro $95M — chasing call-deflection ROI)
- Generic symptom checking (mature, hard accuracy ceiling, Babylon as cautionary tale)
- In-visit ambient + payer action (Abridge/Availity, Cohere/Dragon Copilot)

**Genuinely open:**
1. **Conversational voice pre-visit clinical history-taking** — a structural gap *between* two well-funded adjacent categories. Neither the forms vendors nor the voice-agent vendors do it, and the reason is liability, not oversight.
2. **Patient-reported medication reconciliation by voice** — directly evidenced as the actual failure point (91% omissions from poor history-taking); no consumer/patient-voice product found.
3. **Doorknob-phenomenon mitigation** — pre-eliciting the real priority concern before the visit.

**The through-line:** a voice tool that **surfaces information for a clinician to review** — rather than diagnosing — sidesteps the liability wall that keeps everyone else in the logistics lane. Refusing capability is what makes the position available.
