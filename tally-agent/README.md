# Gopiram Tally Sync Agent

This small program runs on the **shop's PC where Tally is installed**. Every few
minutes it reads stock balances from Tally and sends them to the cloud, so the
app shows up-to-date stock from anywhere.

It only ever **reads** from Tally — it never changes anything in Tally.

---

## One-time setup (on the shop PC)

### 1. Install Node.js
Download the "LTS" version from https://nodejs.org and install it (click through
the defaults). This only has to be done once.

### 2. Copy this folder
Copy the whole `tally-agent` folder onto the shop PC (e.g. to the Desktop).

### 3. Create the settings file
- In the folder, copy `.env.example` and rename the copy to `.env`
- Open `.env` in Notepad and set:
  - `CLOUD_URL` — your backend address (already filled: `https://api.gopiramsarees.in`)
  - `SYNC_TOKEN` — the secret. It must **exactly match** the `SYNC_AGENT_TOKEN`
    value set on the server (Railway). Ask whoever set up the server, or copy it
    from the Railway variables.
- Save and close.

### 4. Turn on Tally's connector (one time, in Tally)
- Open Tally and load the company.
- Press **F1 → Settings → Connectivity** (Tally Prime), or **Gateway of Tally →
  F12**, and set Tally to act as a server on **port 9000** (TallyPrime:
  "Client/Server configuration" → *TallyPrime acts as → Both* or *Server*).
- Leave Tally open with the company loaded — the agent needs it running.

### 5. Start the agent
Double-click **`start.bat`**. The first time it will install what it needs, then
start syncing. A black window will show messages like:

```
[10:05:01 AM] Synced 240 stock items to the cloud.
```

**Keep that window open.** Closing it stops the syncing.

---

## Keeping it running automatically (optional but recommended)

So you don't have to start it by hand each day, add it to Windows startup:

1. Press `Win + R`, type `shell:startup`, press Enter.
2. Right-click `start.bat` → **Create shortcut**, and move the shortcut into the
   Startup folder that opened.

Now it launches automatically whenever the PC is turned on (as long as Tally is
open).

---

## Troubleshooting

- **"Cannot reach Tally…"** → Tally isn't open, no company is loaded, or the
  XML port isn't enabled (step 4).
- **"Cloud rejected the sync… check SYNC_TOKEN"** → the `SYNC_TOKEN` in `.env`
  doesn't match the server's `SYNC_AGENT_TOKEN`.
- **Stock shows but a design says "No Tally link"** → that design's *Tally Item
  Name* in the app doesn't match the stock item's name in Tally. Edit the design
  and set the exact Tally name.
