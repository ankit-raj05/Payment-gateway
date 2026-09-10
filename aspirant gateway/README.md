# Aspirant Open School payment portal

This replaces Microsoft Forms with one student-facing admission form, a UPI QR checkout, screenshot/UTR collection, a **pending** payment state, and a password-protected manual approval dashboard.

## Start locally

Use Node.js 18+.

```powershell
$env:ADMIN_PASSWORD = "choose-a-long-private-password"
node server.js
```

Open `http://localhost:3000`. The same password opens the Admin section.

## Current fees

The live-site prices configured are:

- Class 10: ₹5,999
- Class 11: ₹7,999
- Class 12: ₹9,999
- 11th + 12th Combo: ₹14,999
- 10+11+12 Combo: ₹19,999

UPI receiver: `9470258885@ybl`.

## Important production notes

- This is intentionally **manual approval**. A screenshot/UTR must never automatically count as bank-confirmed payment.
- `data.json` stores applications (including private student data and screenshots) on the machine where the server runs. Back it up securely and do not expose it publicly.
- Before publishing, deploy behind HTTPS, set a strong `ADMIN_PASSWORD` through the host's secret manager, and use a managed database/object storage.
- The QR image uses QuickChart only to render the UPI deep link. Payments go directly through the customer's UPI app to the specified UPI ID; this app never collects a UPI PIN.
