"""
MailVault — Outlook Mail Reader Backend
Flask server that proxies Microsoft Graph API requests to read inbox emails.
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests as http_requests
import os

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

# Microsoft OAuth2 endpoints
TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_API_BASE = "https://graph.microsoft.com/v1.0"


@app.route("/")
def serve_index():
    """Serve the main HTML page."""
    return send_from_directory("static", "index.html")


@app.route("/api/read-mail", methods=["POST"])
def read_mail():
    """
    Read inbox emails using Microsoft Graph API.

    Accepts credentials in format: email|password|refresh_token|client_id
    Supports two modes:
    - OAuth2: Uses refresh_token + client_id to get access_token
    - Graph API: Uses a direct access_token
    """
    data = request.json
    credential_line = data.get("credentials", "").strip()
    mode = data.get("mode", "oauth2")  # "oauth2" or "graphapi"
    page_size = data.get("pageSize", 20)

    if not credential_line:
        return jsonify({"error": "No credentials provided"}), 400

    try:
        if mode == "oauth2":
            return _handle_oauth2(credential_line, page_size)
        else:
            return _handle_graph_api(credential_line, page_size)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _handle_oauth2(credential_line, page_size):
    """Handle OAuth2 mode: refresh_token → access_token → inbox."""
    parts = credential_line.split("|")

    if len(parts) < 4:
        return jsonify({
            "error": "Invalid format. Expected: email|password|refresh_token|client_id"
        }), 400

    email = parts[0].strip()
    refresh_token = parts[2].strip()
    client_id = parts[3].strip()

    # Exchange refresh_token for access_token
    token_data = {
        "client_id": client_id,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "scope": "https://graph.microsoft.com/.default offline_access"
    }

    token_response = http_requests.post(TOKEN_URL, data=token_data, timeout=30)

    if token_response.status_code != 200:
        error_info = token_response.json()
        error_desc = error_info.get("error_description", "Failed to obtain access token")
        return jsonify({
            "error": f"Token exchange failed: {error_desc}",
            "email": email
        }), 401

    token_json = token_response.json()
    access_token = token_json.get("access_token")
    new_refresh_token = token_json.get("refresh_token", refresh_token)

    if not access_token:
        return jsonify({
            "error": "No access token received from Microsoft. Please check your refresh_token and client_id.",
            "email": email
        }), 401

    # Fetch inbox emails
    emails = _fetch_inbox(access_token, page_size)

    return jsonify({
        "success": True,
        "email": email,
        "emails": emails,
        "newRefreshToken": new_refresh_token,
        "totalEmails": len(emails)
    })


def _handle_graph_api(credential_line, page_size):
    """Handle Graph API mode: direct access_token → inbox."""
    parts = credential_line.split("|")

    # In Graph API mode, the first part could be email, second is the access token
    if len(parts) >= 2:
        email = parts[0].strip()
        access_token = parts[1].strip()
    else:
        email = "Unknown"
        access_token = parts[0].strip()

    if not access_token:
        return jsonify({"error": "No access token provided"}), 400

    # Fetch inbox emails
    emails = _fetch_inbox(access_token, page_size)

    return jsonify({
        "success": True,
        "email": email,
        "emails": emails,
        "totalEmails": len(emails)
    })


def _fetch_inbox(access_token, page_size=20):
    """Fetch inbox messages from Microsoft Graph API."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    # Request inbox messages with selected fields
    params = {
        "$top": page_size,
        "$orderby": "receivedDateTime desc",
        "$select": "id,subject,from,receivedDateTime,isRead,bodyPreview,body,hasAttachments,importance"
    }

    url = f"{GRAPH_API_BASE}/me/mailFolders/inbox/messages"
    response = http_requests.get(url, headers=headers, params=params, timeout=30)

    if response.status_code != 200:
        error_info = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        error_msg = error_info.get("error", {}).get("message", "Failed to fetch emails")
        raise Exception(f"Graph API error: {error_msg}")

    data = response.json()
    messages = data.get("value", [])

    # Format the email data
    formatted_emails = []
    for msg in messages:
        from_info = msg.get("from", {}).get("emailAddress", {})
        formatted_emails.append({
            "id": msg.get("id"),
            "subject": msg.get("subject", "(No Subject)"),
            "fromName": from_info.get("name", "Unknown"),
            "fromEmail": from_info.get("address", ""),
            "receivedAt": msg.get("receivedDateTime", ""),
            "isRead": msg.get("isRead", False),
            "bodyPreview": msg.get("bodyPreview", ""),
            "bodyHtml": msg.get("body", {}).get("content", ""),
            "bodyType": msg.get("body", {}).get("contentType", "text"),
            "hasAttachments": msg.get("hasAttachments", False),
            "importance": msg.get("importance", "normal")
        })

    return formatted_emails


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"\n{'='*50}")
    print(f"  MailVault — Outlook Mail Reader")
    print(f"  Running on http://localhost:{port}")
    print(f"{'='*50}\n")
    app.run(host="0.0.0.0", port=port, debug=True)
