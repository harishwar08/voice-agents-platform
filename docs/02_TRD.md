# AI Employee Platform --- TRD

## Technical Goal

Build a modular AI Employee platform separating conversational
intelligence, business knowledge, structured business data, and actions.

## Proposed Stack

-   Frontend: Next.js, React, TypeScript, Tailwind CSS.
-   Backend: Python, FastAPI.
-   Database: PostgreSQL.
-   Cache/Queue: Redis.
-   Vector search: PostgreSQL + pgvector initially.
-   Object storage: S3-compatible storage.
-   Hosting: production cloud platform such as AWS or equivalent.
-   Authentication: secure session/token-based authentication; provider
    finalized before implementation.

## Provider Interfaces

Keep integrations replaceable: - STTProvider - LLMProvider -
TTSProvider - TelephonyProvider - WhatsAppProvider

## AI Pipeline

``` text
Phone Audio -> STT -> Conversation State -> Intent/Tool Router
-> Structured Data / Knowledge / Tools -> LLM -> TTS -> Customer
```

## Business Brain

### Structured Data

Products, variants, prices, inventory, offers, availability, locations.

### Knowledge Base

FAQs, documents, descriptions, policies, brochures, website information.

### Rules

Conversation restrictions, escalation rules, business policies, allowed
actions.

## Source Selection

-   Product/price -\> structured database.
-   FAQ/policy -\> knowledge base.
-   Current availability -\> database/API.
-   Appointment -\> calendar tool.
-   WhatsApp request -\> WhatsApp tool.

## Dynamic Data

Business data must not be stored only in prompts/model weights. Database
is the source of truth for dynamic data.

### Scheduled Changes

Fields:

``` text
id
business_id
entity_type
entity_id
field
old_value
new_value
effective_at
status
created_by
created_at
executed_at
```

At `effective_at`, a worker activates the new value and records an audit
event.

## Knowledge Retrieval

``` text
Upload -> Parse -> Chunk -> Embed -> Store -> Retrieve -> Context -> LLM
```

Return source metadata.

## Structured Retrieval

Use deterministic lookup where possible:

``` text
find_product(business_id, product_name, variant)
```

If no exact product is found, do not invent an answer.

## Tools

-   send_whatsapp
-   send_brochure
-   send_location
-   check_inventory
-   check_availability
-   book_appointment
-   create_lead
-   update_crm
-   transfer_to_human

## Guardrails

-   Never invent price, stock, offers, or policies.
-   Validate tool inputs.
-   Log tool calls.
-   Provide human escalation.
-   Handle provider/tool failures truthfully.

## Multi-Tenancy

Each business has isolated data for products, knowledge, leads, calls,
AI configuration, and integrations.

## Security

Use tenant isolation, role-based access, encryption, secret management,
audit logs, secure authentication, and least-privilege access.

## Observability

Track STT, LLM, TTS, tool, call, retrieval, and API latency/errors.

## Technical Principle

> Keep the model, business knowledge, structured business data, and
> actions modular.
