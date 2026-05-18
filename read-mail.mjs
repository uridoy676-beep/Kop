/**
 * MailVault — Netlify Serverless Function
 * Handles Microsoft Graph API requests for reading Outlook inbox.
 * Runs on Netlify Functions (Node 18+ with native fetch).
 */

const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

export async function handler(event) {
    // Handle CORS preflight
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            body: "",
        };
    }

    // Only accept POST
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    // CORS headers
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    try {
        const data = JSON.parse(event.body || "{}");
        const credentialLine = (data.credentials || "").trim();
        const mode = data.mode || "oauth2";
        const pageSize = data.pageSize || 20;

        if (!credentialLine) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "No credentials provided" }) };
        }

        if (mode === "oauth2") {
            return await handleOAuth2(credentialLine, pageSize, headers);
        } else {
            return await handleGraphAPI(credentialLine, pageSize, headers);
        }
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message || "Internal server error" }),
        };
    }
}

async function handleOAuth2(credentialLine, pageSize, headers) {
    const parts = credentialLine.split("|");

    if (parts.length < 4) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Invalid format. Expected: email|password|refresh_token|client_id" }),
        };
    }

    const email = parts[0].trim();
    const refreshToken = parts[2].trim();
    const clientId = parts[3].trim();

    // Exchange refresh_token for access_token
    const tokenBody = new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://graph.microsoft.com/.default offline_access",
    });

    const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
        const errorInfo = await tokenResponse.json().catch(() => ({}));
        const errorDesc = errorInfo.error_description || "Failed to obtain access token";
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: `Token exchange failed: ${errorDesc}`, email }),
        };
    }

    const tokenJson = await tokenResponse.json();
    const accessToken = tokenJson.access_token;
    const newRefreshToken = tokenJson.refresh_token || refreshToken;

    if (!accessToken) {
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({
                error: "No access token received from Microsoft. Please check your refresh_token and client_id.",
                email,
            }),
        };
    }

    // Fetch inbox
    const emails = await fetchInbox(accessToken, pageSize);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            email,
            emails,
            newRefreshToken,
            totalEmails: emails.length,
        }),
    };
}

async function handleGraphAPI(credentialLine, pageSize, headers) {
    const parts = credentialLine.split("|");
    let email = "Unknown";
    let accessToken;

    if (parts.length >= 2) {
        email = parts[0].trim();
        accessToken = parts[1].trim();
    } else {
        accessToken = parts[0].trim();
    }

    if (!accessToken) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "No access token provided" }),
        };
    }

    const emails = await fetchInbox(accessToken, pageSize);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            email,
            emails,
            totalEmails: emails.length,
        }),
    };
}

async function fetchInbox(accessToken, pageSize = 20) {
    const params = new URLSearchParams({
        $top: pageSize,
        $orderby: "receivedDateTime desc",
        $select: "id,subject,from,receivedDateTime,isRead,bodyPreview,body,hasAttachments,importance",
    });

    const url = `${GRAPH_API_BASE}/me/mailFolders/inbox/messages?${params}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const errorInfo = await response.json().catch(() => ({}));
        const errorMsg = errorInfo?.error?.message || "Failed to fetch emails";
        throw new Error(`Graph API error: ${errorMsg}`);
    }

    const data = await response.json();
    const messages = data.value || [];

    return messages.map((msg) => {
        const fromInfo = msg.from?.emailAddress || {};
        return {
            id: msg.id,
            subject: msg.subject || "(No Subject)",
            fromName: fromInfo.name || "Unknown",
            fromEmail: fromInfo.address || "",
            receivedAt: msg.receivedDateTime || "",
            isRead: msg.isRead || false,
            bodyPreview: msg.bodyPreview || "",
            bodyHtml: msg.body?.content || "",
            bodyType: msg.body?.contentType || "text",
            hasAttachments: msg.hasAttachments || false,
            importance: msg.importance || "normal",
        };
    });
}
