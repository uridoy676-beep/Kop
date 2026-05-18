/**
 * MailVault — Frontend Application Logic
 * Handles credential input, API calls, and email rendering.
 */

// === Avatar color palette (Outlook-style) ===
const AVATAR_COLORS = [
    "#0f6cbd", "#c239b3", "#9c5700", "#077568",
    "#da3b01", "#5c2e91", "#0078d4", "#008575",
    "#c4314b", "#8764b8", "#ca5010", "#498205",
    "#005b70", "#986f0b", "#c43e1c", "#4f6bed",
];

function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
}

// === State ===
const state = {
    mode: "oauth2",
    isLoading: false,
    currentCredentials: "",
    emails: [],
};

// === DOM Elements ===
const els = {
    credentialInput: document.getElementById("credentialInput"),
    readMailBtn: document.getElementById("readMailBtn"),
    btnContent: null,
    btnLoading: null,
    clearBtn: document.getElementById("clearBtn"),
    pasteBtn: document.getElementById("pasteBtn"),
    modeOAuth2: document.getElementById("modeOAuth2"),
    modeGraphAPI: document.getElementById("modeGraphAPI"),
    inputHint: document.getElementById("inputHint"),
    inputSection: document.getElementById("inputSection"),
    resultsSection: document.getElementById("resultsSection"),
    accountEmail: document.getElementById("accountEmail"),
    accountStats: document.getElementById("accountStats"),
    accountAvatar: document.getElementById("accountAvatar"),
    emailList: document.getElementById("emailList"),
    refreshBtn: document.getElementById("refreshBtn"),
    closeResultsBtn: document.getElementById("closeResultsBtn"),
    statusBadge: document.getElementById("statusBadge"),
    // Modal
    modalOverlay: document.getElementById("modalOverlay"),
    modalSubject: document.getElementById("modalSubject"),
    modalFrom: document.getElementById("modalFrom"),
    modalDate: document.getElementById("modalDate"),
    modalBody: document.getElementById("modalBody"),
    modalAvatar: document.getElementById("modalAvatar"),
    modalCloseBtn: document.getElementById("modalCloseBtn"),
    // Toast
    toastContainer: document.getElementById("toastContainer"),
    // Theme
    themeToggle: document.getElementById("themeToggle"),
};

// === Initialize ===
document.addEventListener("DOMContentLoaded", () => {
    els.btnContent = els.readMailBtn.querySelector(".btn-content");
    els.btnLoading = els.readMailBtn.querySelector(".btn-loading");

    // Event listeners
    els.readMailBtn.addEventListener("click", handleReadMail);
    els.clearBtn.addEventListener("click", () => {
        els.credentialInput.value = "";
        els.credentialInput.focus();
    });
    els.pasteBtn.addEventListener("click", async () => {
        try {
            const text = await navigator.clipboard.readText();
            els.credentialInput.value = text;
            showToast("Pasted from clipboard", "success");
        } catch {
            showToast("Clipboard access denied", "error");
        }
    });

    // Mode switching
    els.modeOAuth2.addEventListener("click", () => setMode("oauth2"));
    els.modeGraphAPI.addEventListener("click", () => setMode("graphapi"));

    // Refresh & close
    els.refreshBtn.addEventListener("click", handleRefresh);
    els.closeResultsBtn.addEventListener("click", closeResults);

    // Modal
    els.modalCloseBtn.addEventListener("click", closeModal);
    els.modalOverlay.addEventListener("click", (e) => {
        if (e.target === els.modalOverlay) closeModal();
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleReadMail();
    });

    // Theme toggle
    initTheme();
    els.themeToggle.addEventListener("click", toggleTheme);
});

// === Mode Switching ===
function setMode(mode) {
    state.mode = mode;

    els.modeOAuth2.classList.toggle("active", mode === "oauth2");
    els.modeGraphAPI.classList.toggle("active", mode === "graphapi");

    if (mode === "oauth2") {
        els.credentialInput.placeholder = "email|password|refresh_token|client_id";
        els.inputHint.innerHTML = 'Format: <code>email|password|refresh_token|client_id</code>';
    } else {
        els.credentialInput.placeholder = "email|access_token";
        els.inputHint.innerHTML = 'Format: <code>email|access_token</code> or just <code>access_token</code>';
    }
}

// === Read Mail ===
async function handleReadMail() {
    const credentials = els.credentialInput.value.trim();
    if (!credentials) {
        showToast("Please enter credentials", "error");
        els.credentialInput.focus();
        return;
    }

    if (state.isLoading) return;
    state.currentCredentials = credentials;

    setLoading(true);
    setStatus("Connecting...", "loading");

    try {
        const response = await fetch("/api/read-mail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                credentials: credentials,
                mode: state.mode,
                pageSize: 30,
            }),
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        state.emails = data.emails || [];
        renderResults(data);
        setStatus("Connected", "success");
        showToast(`${data.totalEmails} emails loaded`, "success");

    } catch (error) {
        console.error("Read mail error:", error);
        setStatus("Error", "error");
        showToast(error.message || "Failed to read mailbox", "error");
    } finally {
        setLoading(false);
    }
}

// === Refresh ===
async function handleRefresh() {
    if (!state.currentCredentials) return;
    els.refreshBtn.classList.add("spinning");
    await handleReadMail();
    els.refreshBtn.classList.remove("spinning");
}

// === Render Results ===
function renderResults(data) {
    // Hide input, show results
    els.inputSection.style.display = "none";
    els.resultsSection.style.display = "block";

    // Update account info
    const email = data.email || "Unknown";
    els.accountEmail.textContent = email;
    els.accountStats.textContent = `${data.totalEmails} email${data.totalEmails !== 1 ? "s" : ""} in inbox`;

    const acctColor = getAvatarColor(email);
    els.accountAvatar.textContent = getInitials(email.split("@")[0]);
    els.accountAvatar.style.background = acctColor;

    // Render email list
    if (state.emails.length === 0) {
        els.emailList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                        <rect x="6" y="12" width="36" height="24" rx="4" stroke="currentColor" stroke-width="1.5" fill="none"/>
                        <path d="M8 14L24 28L40 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
                    </svg>
                </div>
                <p class="empty-state-title">No messages</p>
                <p class="empty-state-text">This inbox is empty</p>
            </div>
        `;
        return;
    }

    els.emailList.innerHTML = state.emails.map((email, idx) => {
        const isUnread = !email.isRead;
        const date = formatDate(email.receivedAt);
        const fromName = email.fromName || "Unknown";
        const subject = email.subject || "(No Subject)";
        const preview = email.bodyPreview || "";
        const initials = getInitials(fromName);
        const color = getAvatarColor(fromName);

        let badges = "";
        if (email.hasAttachments) {
            badges += `<span class="email-badge badge-attachment">
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M7.5 2.5L3 7a3 3 0 0 0 4.24 4.24L12 6.5a2 2 0 0 0-2.83-2.83L4.41 8.44a1 1 0 0 0 1.41 1.41L10 5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            </span>`;
        }
        if (email.importance === "high") {
            badges += `<span class="email-badge badge-important">!</span>`;
        }

        return `
            <div class="email-card ${isUnread ? 'unread' : ''}" data-index="${idx}" style="animation-delay: ${idx * 0.03}s" onclick="openEmailDetail(${idx})">
                <div class="email-avatar" style="background:${color}">${escapeHtml(initials)}</div>
                <div class="email-content">
                    <div class="email-row-1">
                        <span class="email-from">${escapeHtml(fromName)}</span>
                        <span class="email-date">${escapeHtml(date)}</span>
                    </div>
                    <div class="email-row-2">
                        <span class="email-subject">${escapeHtml(subject)}</span>
                        ${badges ? `<span class="email-badges-inline">${badges}</span>` : ""}
                    </div>
                    <div class="email-row-3">${escapeHtml(preview)}</div>
                </div>
            </div>
        `;
    }).join("");

    // Smooth scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// === Email Detail Modal ===
function openEmailDetail(index) {
    const email = state.emails[index];
    if (!email) return;

    const fromName = email.fromName || "Unknown";
    const initials = getInitials(fromName);
    const color = getAvatarColor(fromName);

    els.modalSubject.textContent = email.subject || "(No Subject)";
    els.modalFrom.textContent = `${fromName} <${email.fromEmail}>`;
    els.modalDate.textContent = formatDate(email.receivedAt, true);
    els.modalAvatar.textContent = initials;
    els.modalAvatar.style.background = color;

    if (email.bodyType === "html" && email.bodyHtml) {
        els.modalBody.innerHTML = sanitizeHtml(email.bodyHtml);
    } else {
        els.modalBody.textContent = email.bodyPreview || "(No content)";
    }

    els.modalOverlay.style.display = "flex";
    document.body.style.overflow = "hidden";
}

function closeModal() {
    els.modalOverlay.style.display = "none";
    document.body.style.overflow = "";
}

// === Close Results ===
function closeResults() {
    els.resultsSection.style.display = "none";
    els.inputSection.style.display = "block";
    state.emails = [];
    setStatus("Ready", "ready");
}

// === Loading State ===
function setLoading(loading) {
    state.isLoading = loading;
    els.readMailBtn.disabled = loading;
    els.btnContent.style.display = loading ? "none" : "flex";
    els.btnLoading.style.display = loading ? "flex" : "none";
}

// === Status Badge ===
function setStatus(text, type) {
    const dot = els.statusBadge.querySelector(".status-dot");
    // Update the text node safely: find the last text node or replace all text
    const textNodes = Array.from(els.statusBadge.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
    if (textNodes.length > 0) {
        textNodes[textNodes.length - 1].textContent = ` ${text}`;
    } else {
        els.statusBadge.appendChild(document.createTextNode(` ${text}`));
    }

    const colors = {
        success: { bg: "rgba(16,124,16,0.1)", border: "rgba(16,124,16,0.2)", text: "#107c10", dot: "#6ccb5f" },
        error: { bg: "rgba(209,52,56,0.1)", border: "rgba(209,52,56,0.2)", text: "#d13438", dot: "#d13438" },
        loading: { bg: "rgba(255,211,53,0.12)", border: "rgba(255,211,53,0.2)", text: "#986f0b", dot: "#ffd335" },
        ready: { bg: "rgba(16,124,16,0.1)", border: "rgba(16,124,16,0.2)", text: "#107c10", dot: "#6ccb5f" },
    };

    const c = colors[type] || colors.ready;
    els.statusBadge.style.background = c.bg;
    els.statusBadge.style.borderColor = c.border;
    els.statusBadge.style.color = c.text;
    dot.style.background = c.dot;
}

// === Toast Notifications ===
function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const icons = {
        error: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
        success: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M5 8L7 10L11 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        info: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M8 7V11M8 5.5V5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    els.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-exit");
        setTimeout(() => toast.remove(), 250);
    }, 4000);
}

// === Utilities ===
function formatDate(dateStr, full = false) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();

    if (full) {
        return date.toLocaleString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    }

    if (date.getFullYear() === now.getFullYear()) {
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function sanitizeHtml(html) {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
        .replace(/<embed\b[^>]*>/gi, "")
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
        .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
        .replace(/javascript\s*:/gi, "")
        .replace(/vbscript\s*:/gi, "")
        .replace(/data\s*:\s*text\/html/gi, "");
}

// === Theme Toggle ===
function initTheme() {
    const saved = localStorage.getItem("mailvault-theme");
    const theme = saved || "light";
    applyTheme(theme);
}

function toggleTheme() {
    const current = document.body.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("mailvault-theme", next);
}

function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    const moonIcon = els.themeToggle.querySelector(".theme-icon-moon");
    const sunIcon = els.themeToggle.querySelector(".theme-icon-sun");

    if (theme === "dark") {
        moonIcon.style.display = "none";
        sunIcon.style.display = "flex";
    } else {
        moonIcon.style.display = "flex";
        sunIcon.style.display = "none";
    }
}
