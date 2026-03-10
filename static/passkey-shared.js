function passkeyRoot() {
  return document.querySelector("[data-passkey-flow]");
}

function statusEl() {
  return document.getElementById("status");
}

function actionButton() {
  return document.getElementById("passkey-action");
}

function setStatus(message, kind = "") {
  const el = statusEl();
  if (!el) return;
  el.textContent = message;
  el.className = kind ? kind : "";
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function encodeBase64Url(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

function publicKeyCredentialToJSON(credential) {
  const response = credential.response;
  const json = {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    response: {},
  };

  if (response.clientDataJSON) {
    json.response.clientDataJSON = encodeBase64Url(response.clientDataJSON);
  }
  if (response.attestationObject) {
    json.response.attestationObject = encodeBase64Url(
      response.attestationObject,
    );
  }
  if (response.authenticatorData) {
    json.response.authenticatorData = encodeBase64Url(
      response.authenticatorData,
    );
  }
  if (response.signature) {
    json.response.signature = encodeBase64Url(response.signature);
  }
  if (response.userHandle) {
    json.response.userHandle = encodeBase64Url(response.userHandle);
  }
  return json;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `HTTP ${res.status}` };
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function bindPasskeyAction(handler) {
  const button = actionButton();
  if (!button) return;
  button.addEventListener("click", () => {
    void handler(button);
  });
}

window.LineagePasskey = {
  passkeyRoot,
  setStatus,
  decodeBase64Url,
  encodeBase64Url,
  publicKeyCredentialToJSON,
  postJson,
  bindPasskeyAction,
  encodeBase64Url,
};
