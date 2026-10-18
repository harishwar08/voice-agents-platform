# AI Employee Platform --- Backend Schema

## Database Principles

-   PostgreSQL.
-   UUID primary keys.
-   Foreign keys.
-   Timestamps.
-   Tenant isolation.
-   Auditability.
-   AI versioning.
-   Dynamic business data separate from AI configuration.

## Core Tables

### users

``` text
id UUID PK
email TEXT UNIQUE
name TEXT
role TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### businesses

``` text
id UUID PK
name TEXT
industry TEXT
phone TEXT
email TEXT
timezone TEXT
status TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### business_members

``` text
id UUID PK
business_id UUID FK -> businesses.id
user_id UUID FK -> users.id
role TEXT
created_at TIMESTAMP
```

### ai_employees

``` text
id UUID PK
business_id UUID FK -> businesses.id
name TEXT
description TEXT
status TEXT
current_version_id UUID
created_at TIMESTAMP
updated_at TIMESTAMP
```

### ai_versions

``` text
id UUID PK
ai_employee_id UUID FK -> ai_employees.id
version_number INTEGER
configuration JSONB
status TEXT
created_by UUID FK -> users.id
created_at TIMESTAMP
deployed_at TIMESTAMP NULL
```

### products

``` text
id UUID PK
business_id UUID FK -> businesses.id
name TEXT
brand TEXT
category TEXT
description TEXT
status TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### product_variants

``` text
id UUID PK
product_id UUID FK -> products.id
sku TEXT
variant_name TEXT
attributes JSONB
created_at TIMESTAMP
updated_at TIMESTAMP
```

### product_prices

``` text
id UUID PK
product_variant_id UUID FK -> product_variants.id
price NUMERIC
currency TEXT
effective_from TIMESTAMP
effective_to TIMESTAMP NULL
created_at TIMESTAMP
```

### inventory

``` text
id UUID PK
product_variant_id UUID FK -> product_variants.id
quantity INTEGER
location TEXT
updated_at TIMESTAMP
```

### offers

``` text
id UUID PK
business_id UUID FK -> businesses.id
name TEXT
description TEXT
value JSONB
effective_from TIMESTAMP
effective_to TIMESTAMP NULL
status TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### scheduled_changes

``` text
id UUID PK
business_id UUID FK -> businesses.id
entity_type TEXT
entity_id UUID
field TEXT
old_value JSONB
new_value JSONB
effective_at TIMESTAMP
status TEXT
created_by UUID FK -> users.id
created_at TIMESTAMP
executed_at TIMESTAMP NULL
```

### knowledge_documents

``` text
id UUID PK
business_id UUID FK -> businesses.id
name TEXT
source_type TEXT
storage_path TEXT
status TEXT
metadata JSONB
created_by UUID FK -> users.id
created_at TIMESTAMP
updated_at TIMESTAMP
```

### knowledge_chunks

``` text
id UUID PK
document_id UUID FK -> knowledge_documents.id
content TEXT
embedding VECTOR
metadata JSONB
created_at TIMESTAMP
```

### business_faqs

``` text
id UUID PK
business_id UUID FK -> businesses.id
question TEXT
answer TEXT
status TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### business_rules

``` text
id UUID PK
business_id UUID FK -> businesses.id
name TEXT
rule_type TEXT
configuration JSONB
status TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### customers

``` text
id UUID PK
business_id UUID FK -> businesses.id
name TEXT
phone TEXT
whatsapp_phone TEXT NULL
metadata JSONB
created_at TIMESTAMP
updated_at TIMESTAMP
```

### leads

``` text
id UUID PK
business_id UUID FK -> businesses.id
customer_id UUID FK -> customers.id
source TEXT
requirement TEXT
budget NUMERIC NULL
location TEXT NULL
intent TEXT
lead_score NUMERIC NULL
status TEXT
summary TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### calls

``` text
id UUID PK
business_id UUID FK -> businesses.id
ai_employee_id UUID FK -> ai_employees.id
customer_id UUID FK -> customers.id
direction TEXT
phone_number TEXT
started_at TIMESTAMP
ended_at TIMESTAMP
duration_seconds INTEGER
status TEXT
outcome TEXT
recording_path TEXT NULL
created_at TIMESTAMP
```

### call_transcripts

``` text
id UUID PK
call_id UUID FK -> calls.id
speaker TEXT
text TEXT
language TEXT
timestamp TIMESTAMP
metadata JSONB
```

### whatsapp_messages

``` text
id UUID PK
business_id UUID FK -> businesses.id
customer_id UUID FK -> customers.id
call_id UUID NULL
direction TEXT
message TEXT
template_name TEXT NULL
provider_message_id TEXT NULL
status TEXT
sent_at TIMESTAMP NULL
delivered_at TIMESTAMP NULL
created_at TIMESTAMP
```

### appointments

``` text
id UUID PK
business_id UUID FK -> businesses.id
customer_id UUID FK -> customers.id
lead_id UUID NULL
start_time TIMESTAMP
end_time TIMESTAMP
status TEXT
source TEXT
notes TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### ai_tests

``` text
id UUID PK
ai_employee_id UUID FK -> ai_employees.id
name TEXT
category TEXT
input_text TEXT
expected_output TEXT NULL
expected_tool TEXT NULL
created_by UUID FK -> users.id
created_at TIMESTAMP
updated_at TIMESTAMP
```

### ai_test_results

``` text
id UUID PK
test_id UUID FK -> ai_tests.id
ai_version_id UUID FK -> ai_versions.id
actual_output TEXT
status TEXT
score NUMERIC
metadata JSONB
created_at TIMESTAMP
```

### knowledge_gaps

``` text
id UUID PK
business_id UUID FK -> businesses.id
ai_employee_id UUID FK -> ai_employees.id
call_id UUID NULL
question TEXT
reason TEXT
status TEXT
resolution TEXT NULL
created_at TIMESTAMP
resolved_at TIMESTAMP NULL
```

### ai_feedback

``` text
id UUID PK
business_id UUID FK -> businesses.id
call_id UUID NULL
ai_employee_id UUID FK -> ai_employees.id
rating INTEGER NULL
feedback TEXT
created_by UUID NULL
created_at TIMESTAMP
```

### audit_logs

``` text
id UUID PK
business_id UUID NULL
user_id UUID NULL
action TEXT
entity_type TEXT
entity_id UUID NULL
before_value JSONB NULL
after_value JSONB NULL
created_at TIMESTAMP
```

## Relationships

``` text
businesses
 -> members
 -> ai_employees
 -> products
 -> offers
 -> knowledge
 -> FAQs
 -> rules
 -> customers
 -> leads
 -> calls
 -> WhatsApp messages
 -> appointments
 -> scheduled changes
```

## Security

All business-owned records must enforce tenant isolation and role-based
access.

## API Areas

``` text
/auth
/businesses
/ai-employees
/products
/product-variants
/prices
/inventory
/offers
/knowledge
/faqs
/rules
/scheduled-changes
/customers
/leads
/calls
/whatsapp
/appointments
/ai-tests
/ai-test-results
/knowledge-gaps
/analytics
/deployments
```
