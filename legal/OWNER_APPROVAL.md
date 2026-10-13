# Parsha Pics legal launch approval

The privacy notice and website terms are product-specific drafts, not legal advice. They must remain unpublished and lead capture must remain disabled until the owner reviews the exact drafts and explicitly approves them.

## Decisions to confirm

- Confirm the controller/trader's full legal name, trading name, business structure, and any address or registration details that must be disclosed.
- Confirm that enquiries and the free Lech Lecha sample are fulfilled manually by email.
- Confirm that the forms are for adult school staff and must not collect pupil or child data.
- Confirm Cloudflare, Turnstile, Resend and Zoho as the actual providers and review their data-processing and international-transfer terms.
- Adopt a documented retention schedule for unsuccessful enquiries, customer correspondence, contracts and accounting records.
- Confirm the sample-use restrictions and the default school licence scope, including staff access, worksheet use, redistribution, public posting and AI-training restrictions.
- Confirm quote acceptance, invoicing, delivery, cancellation and refund handling, including whether any sales will be offered to consumers rather than schools/organisations.
- Choose the governing law and courts for paid licences and include them in the written quote/order terms.
- Obtain professional legal review if appropriate for the business and target markets.

## Approval procedure

1. Review `privacy.html` and `terms.html` together with this checklist.
2. Run `npm run build` and note the printed legal approval ID.
3. Approve the exact two files and that ID in writing.
4. Only then set `APPROVED_LEGAL=true` and the matching `LEGAL_APPROVAL_ID` in the production build environment.
5. Keep `LEAD_CAPTURE_ENABLED=false` and `PUBLIC_LAUNCH=false` until the email route, Turnstile, domain and end-to-end delivery are verified.
