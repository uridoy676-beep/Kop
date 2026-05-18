# MailVault — Outlook Mail Reader

Read Outlook inbox emails securely using Microsoft Graph API.

## 🌐 Live Site

**URL:** https://mailvault-reader.netlify.app

**Netlify Site ID:** `3b14a653-a5da-4950-8eaf-dcc219d4ac6b`

---

## 🚀 Deploy / Redeploy to Netlify

ফাইল update করার পর এই command রান করলেই লাইভ হয়ে যাবে:

```bash
export PATH="/usr/local/bin:$PATH" && npx netlify-cli deploy --prod --site 3b14a653-a5da-4950-8eaf-dcc219d4ac6b --dir=static --functions=netlify/functions
```

> **Note:** প্রথমবার রান করলে Netlify login চাইতে পারে। ব্রাউজারে Authorize করলেই হবে।

---

## 🖥️ Local Development

```bash
pip install -r requirements.txt
python server.py
```

Open http://localhost:5050

---

## 📝 Input Format

### OAuth2 Mode (Default)
```
email|password|refresh_token|client_id
```

### Graph API Mode
```
email|access_token
```
or just:
```
access_token
```

---

## 📁 Project Structure

```
OAuth2 - Website/
├── netlify.toml                    # Netlify config (redirects + functions)
├── netlify/functions/
│   └── read-mail.mjs              # Serverless function (Netlify deploy)
├── static/                         # Frontend (publish directory)
│   ├── index.html                 # Main HTML page
│   ├── css/style.css              # Styles (light/dark theme)
│   └── js/app.js                  # Frontend logic
├── server.py                       # Local dev server (Flask)
├── requirements.txt                # Python dependencies
├── .gitignore
└── README.md
```

---

## ⚙️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | HTML, CSS, JavaScript (Vanilla) |
| Backend (Local) | Python Flask |
| Backend (Netlify) | Serverless Functions (Node.js) |
| API | Microsoft Graph API v1.0 |
| Hosting | Netlify (Free) |

---

## 🔑 Important Links

- **Live Site:** https://mailvault-reader.netlify.app
- **Netlify Dashboard:** https://app.netlify.com/projects/mailvault-reader
- **Function Logs:** https://app.netlify.com/projects/mailvault-reader/logs/functions
- **Microsoft Graph API Docs:** https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview
