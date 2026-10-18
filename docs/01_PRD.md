# AI Employee Platform --- PRD

## Product Vision

Build a managed AI Employee platform for Indian businesses. The AI
employee conducts natural voice conversations, understands
business-specific information, accesses current business data, sends
WhatsApp messages, books appointments, follows up, updates CRM, and
escalates to humans.

The business owner should not need to understand prompts, RAG,
embeddings, model configuration, or AI training.

## Problem

Businesses lose leads and time because of missed calls, repetitive
questions, slow follow-ups, manual WhatsApp communication, manual
appointment booking, language barriers, and difficult AI configuration.

## Target Users

### Business

Indian businesses with high customer-enquiry volume. Initial vertical:
real estate.

### Internal AI Trainer / AI Manager

A team member who configures, tests, monitors, and continuously improves
each AI employee.

## Core Differentiation

We manage the complexity for the business. The business provides
information; our team prepares, tests, deploys, and monitors the AI
employee.

### Business Brain

-   Structured data: products, prices, stock, variants, offers,
    availability.
-   Knowledge base: FAQs, documents, brochures, policies, website
    information.
-   Rules: business policies, restrictions, escalation and workflow
    rules.

Business data can change without retraining the conversational model.

## Must-Have Features

1.  AI voice employee.
2.  English, Telugu, and Tanglish support.
3.  Business Brain.
4.  Product/service structured data.
5.  Dynamic price, stock and offer updates.
6.  File upload.
7.  Knowledge retrieval.
8.  Tool/action execution.
9.  WhatsApp messaging.
10. Lead management.
11. Appointment booking.
12. AI monitoring.
13. AI test lab.
14. AI versioning.
15. Internal AI Trainer Console.
16. Simple Business Owner Dashboard.

## Example

Customer: "iPhone 15 price entha?" AI retrieves the current product
price.

Customer: "What about Pixel 9?" AI performs a new product lookup.

Customer: "Pixel 9 stock lo undha?" AI checks current inventory.

Customer: "WhatsApp lo details pampinchandi." AI sends personalized
information through WhatsApp.

## Dynamic Updates

Example: - Current price: ₹15,000. - Scheduled new price: ₹17,000. -
Effective: tomorrow at 2:00 PM.

The system changes the active value at 2:00 PM without model retraining.

## Out of Scope for Initial MVP

-   Building a foundation LLM from scratch.
-   Building a telecom network.
-   Supporting every Indian language immediately.
-   Every CRM/ERP integration.
-   Uncontrolled autonomous model modification.

## Success Metrics

Track: - Conversation accuracy - Intent accuracy - Entity extraction -
Business-data accuracy - Tool accuracy - Telugu/Tanglish accuracy -
Hallucination rate - Latency - Calls answered - Qualified leads -
WhatsApp messages - Appointments - Human transfers

## Team

-   Model Trainer: AI quality, evaluation, training/configuration.
-   Developer: platform, backend, frontend, database, integrations,
    infrastructure.
-   Product Lead: product strategy, roadmap, UX, requirements, testing.
-   Growth/Operations: marketing, sales, onboarding, pilots, customer
    feedback.

## Product Principle

> The model learns how to converse. The Business Brain knows what is
> true about the business.
