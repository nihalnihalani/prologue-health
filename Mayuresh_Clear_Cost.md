# ClearCost

**Voice-first patient intake that tells you what your visit will cost — before you see the doctor.**

Built at the Medplum (S22) Agentic Healthcare Hackathon, Y Combinator SF — Aug 1, 2026.

---

## The problem

No one in America knows what a doctor's visit costs until the bill arrives weeks later. Patients delay care because of that uncertainty, and clinicians spend the first ten minutes of every visit re-collecting history the patient has already given three times.

Both problems are solvable before the patient ever walks in.

## What it does

A patient calls in and describes their symptoms in ordinary conversation. While they talk, ClearCost:

1. **Charts the encounter live** — the transcript is converted into structured FHIR resources (`Encounter`, `Condition`, `Observation`) and written to Medplum in real time, so the clinician opens a complete chart before the patient arrives.
2. **Predicts the billing codes** — maps the described symptoms to the likely CPT and ICD-10 codes for the visit.
3. **Checks the patient's actual benefits** — runs a live 270/271 eligibility transaction through Stedi and parses the returned benefit structure: remaining deductible, copay, coinsurance, out-of-pocket max.
4. **Speaks the cost estimate back** — computes out-of-pocket cost and says it out loud: *"Your deductible isn't met, so this visit will run about $240."*
5. **Advocates for the patient** — doesn't stop at the number. It offers a cheaper clinically-equivalent path: *"The urgent care option would be about $95 — want me to set that up instead?"*

The patient hangs up knowing what's likely going on, what it costs, and what their best option is.

## How the cost estimate works

This is the part people assume is impossible, so it's worth being precise. The estimate comes from combining two independent pieces of information:

**Total cost of the visit** — predicted CPT codes priced against a fee schedule.
`"itchy rash, two weeks, spreading"` → CPT 99203 (new patient, low complexity) → ~$150 allowed amount

**Patient's share of that cost** — from the 271 eligibility response's EB segments:

| Field | Example |
|---|---|
| Deductible remaining | $1,760 of $2,000 |
| Copay | $30 per office visit |
| Coinsurance | 20% after deductible |
| Out-of-pocket max | $6,000 |

**The waterfall:**

```
if out_of_pocket_met:        patient_owes = 0
elif deductible_remaining>0: patient_owes = min(allowed_amount, deductible_remaining)
else:                        patient_owes = copay + coinsurance_pct * allowed_amount
```

### Known simplification

Payer-negotiated rates are not public per-provider, so we price CPT codes against the **public Medicare fee schedule as a proxy**. Production systems would use payer price-transparency files, hospital chargemaster data, or historical claims.

This is an **estimate, not a guarantee** — the final bill depends on what the clinician actually performs and codes. Every real cost estimator carries the same caveat, and the agent says so out loud in the call.

## Architecture

```
  Phone call
      │
      ▼
  Deepgram  ──────────►  Voice agent (STT / TTS)
      │
      ▼
  FastAPI orchestrator
      │
      ├──►  LLM extraction  ──►  FHIR resources  ──►  Medplum
      │
      ├──►  Symptom → CPT / ICD-10 prediction
      │
      ├──►  Stedi 270 request  ──►  271 response  ──►  benefit parser
      │
      └──►  Cost waterfall  ──►  spoken estimate + alternative
```

## Stack

| Layer | Tool |
|---|---|
| Voice | Deepgram (STT, TTS, voice agent) |
| Clinical data | Medplum (FHIR R4) |
| Eligibility | Stedi (270/271, test mode) |
| Orchestration | FastAPI (Python) |
| Pricing | Medicare fee schedule lookup (local JSON) |

## Data & privacy

No real patient data is used anywhere in this project. All patients are synthetic FHIR resources created in Medplum, and all eligibility checks run against **Stedi test mode mock payers** — no real payer network is contacted, and no insurance card or PHI is required to run the demo.

## Repo layout

```
clearcost/
├── README.md
├── app/
│   ├── main.py              # FastAPI entrypoint
│   ├── voice/               # Deepgram session handling
│   ├── charting/            # transcript → FHIR resources → Medplum
│   ├── coding/              # symptom → CPT / ICD-10
│   ├── eligibility/         # Stedi 270 request + 271 parser
│   └── pricing/
│       ├── waterfall.py     # out-of-pocket calculation
│       └── fee_schedule.json
├── data/
│   └── seed_patient.py      # synthetic patient + coverage
└── demo/
    └── call_script.md       # the scripted demo conversation
```

## Running it

```bash
git clone <repo>
cd clearcost
pip install -r requirements.txt
cp .env.example .env          # add DEEPGRAM_API_KEY, MEDPLUM_CLIENT_ID/SECRET, STEDI_API_KEY
python data/seed_patient.py   # creates the synthetic patient + coverage in Medplum
uvicorn app.main:app --reload
```

## What's real vs. mocked

Being explicit, because this matters in healthcare:

| Component | Status |
|---|---|
| Voice conversation | Real — live Deepgram session |
| FHIR charting | Real — resources written to Medplum |
| Eligibility check | Real 270/271 transaction, Stedi **test mode** payers |
| Benefit parsing | Real — parsed from the returned 271 |
| CPT pricing | Medicare fee schedule proxy, local lookup |
| Alternative-care options | Static table of care-setting price points |

## What's next

- Payer price-transparency files instead of the Medicare proxy, for true negotiated rates
- Real referral booking on the cheaper-alternative path
- Confidence intervals on the estimate rather than a single number
- Clinician-facing pre-visit brief generated from the same intake

---

Built by Mayuresh Pandey — [GitHub](https://github.com/mayu99) · [LinkedIn](https://linkedin.com/in/mayureshpp)
