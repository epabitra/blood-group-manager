# Blood Group Manager

A simple, free web app for blood donation groups. It keeps a list of donors and helps you find
donors who can give blood **right now** when someone calls with an emergency.

- **Frontend:** React (Vite), hosted free on GitHub Pages
- **Backend:** Google Apps Script
- **Database:** Google Sheet

## Features

- **Login required.** People without a username and password only see the login page and get no data.
- **Urgent search.** Tap the patient's blood group to see eligible donors, with exact matches first,
  then compatible groups. Filter by area. One-tap **Call** and **WhatsApp** (with a ready-made message), and **Copy list**.
- **Automatic eligibility.** Uses the gap since the last donation (90 days for men, 120 for women),
  age 18–65 and weight ≥ 45 kg.
- **Donor list with categories.** Tabs per blood group, instant search (name, phone, area, city, pincode),
  filters for eligibility and availability, sorting, and CSV export.
- **Donation records.** Saving a donation updates "last donated" and the donation count, and keeps the history.
- **Duplicate check** on phone numbers.
- **Roles.** Admins can also delete donors. Users are managed from a menu inside the Google Sheet.
- **Mobile-friendly**, and can be added to the phone home screen.

## Donor information stored

| Field | Why |
|---|---|
| Name, Phone*, Alternate phone | Contact (*required) |
| Blood group* | Includes Bombay (Oh) and Unknown |
| Gender, Date of birth, Weight | Eligibility rules (gap days, age, weight) |
| Email | Optional contact |
| Address, Area / Locality, City, Pincode | Find donors near the patient |
| Last donated, Total donations | Eligibility and recognition |
| Availability | Available / Unavailable / Do Not Contact |
| Medical notes, Notes | Deferral reasons, best time to call, etc. |
| Registered at (camp / source) | Which camp the donor came from |
| Created / Updated at, Updated by | Audit trail (automatic) |

## Setup

The step-by-step setup guides are kept privately in the `docs/` folder on the maintainer's
computer (they are not committed to this repository). Ask the maintainer for them.

## How the security works

1. The login sends the username and password to the Apps Script backend.
2. Passwords are stored only as salted, repeatedly-hashed values (SHA-256) in the **Users** sheet.
3. After a successful login the backend returns a random session token. It is valid for 6 hours and stored in Google's cache.
4. Every other request must include that token. Without it, the backend returns no data.
5. After 5 wrong passwords, that username is locked for 15 minutes.
6. Disabling a user or resetting their password logs them out on all devices.
7. The Google Sheet stays private to the owner's Google account.

## Project structure

```
backend/Code.gs              Apps Script backend (paste into the Sheet's Apps Script editor)
src/api.js                   API client and session handling
src/constants.js             Blood groups, compatibility table, eligibility rules
src/utils.js                 Dates, eligibility, phone links, CSV export
src/App.jsx                  Login gate, navigation, data store
src/components/              Screens: Login, Dashboard, FindDonors, DonorList, DonorForm, DonorDetails, Account
.github/workflows/deploy.yml Builds and publishes to GitHub Pages on every push to main
```

## Commands

```
npm install      # once
npm run dev      # local development (needs .env.local with VITE_API_URL)
npm run build    # production build into dist/
```
