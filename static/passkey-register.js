(function () {
  const shared = window.LineagePasskey;
  const root = shared?.passkeyRoot();

  function normalizeCreationOptions(options) {
    return {
      publicKey: {
        ...options,
        challenge: shared.decodeBase64Url(options.challenge),
        user: {
          ...options.user,
          id: new TextEncoder().encode(options.user.id),
        },
        excludeCredentials: (options.excludeCredentials || []).map((
          credential,
        ) => ({
          ...credential,
          id: shared.decodeBase64Url(credential.id),
        })),
      },
    };
  }

  async function start(button) {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      shared.setStatus("This browser does not support passkeys.", "error");
      return;
    }

    const usernameInput = document.getElementById("username");
    const username = usernameInput
      ? usernameInput.value.trim()
      : (root?.dataset.username || "");
    const inviteToken = root?.dataset.inviteToken || "";
    if (!username) {
      shared.setStatus("Username is required.", "error");
      return;
    }
    button.disabled = true;
    shared.setStatus("Preparing passkey registration...");

    try {
      const beginData = await shared.postJson("/register/begin", {
        inviteToken,
        username,
      });
      shared.setStatus("Touch your authenticator to create a passkey...");
      const credential = await navigator.credentials.create(
        normalizeCreationOptions(beginData),
      );
      if (!credential) throw new Error("credential_creation_cancelled");
      const response = credential.response;
      await shared.postJson("/register/complete", {
        ...shared.publicKeyCredentialToJSON(credential),
        response: {
          ...shared.publicKeyCredentialToJSON(credential).response,
          authenticatorData: shared.encodeBase64Url(
            response.getAuthenticatorData(),
          ),
          publicKey: shared.encodeBase64Url(response.getPublicKey()),
          publicKeyAlgorithm: response.getPublicKeyAlgorithm(),
          transports: response.getTransports ? response.getTransports() : [],
        },
        flowToken: beginData.flowToken,
      });
      shared.setStatus("Registration complete. Redirecting...", "success");
      window.location.assign("/account");
    } catch (error) {
      const message = error && error.name === "NotAllowedError"
        ? "Passkey prompt was cancelled or timed out."
        : String(error?.message || error);
      shared.setStatus(message, "error");
      button.disabled = false;
    }
  }

  shared?.bindPasskeyAction(start);
})();
