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
        excludeCredentials: (options.excludeCredentials || []).map((credential) => ({
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

    const inviteToken = root?.dataset.inviteToken || "";
    if (!inviteToken) {
      shared.setStatus("Enrollment token is required.", "error");
      return;
    }
    button.disabled = true;
    shared.setStatus("Preparing passkey enrollment...");

    try {
      const beginData = await shared.postJson("/enroll/passkey/begin", { inviteToken });
      shared.setStatus("Touch your authenticator to enroll a passkey...");
      const credential = await navigator.credentials.create(
        normalizeCreationOptions(beginData),
      );
      if (!credential) throw new Error("credential_creation_cancelled");
      const response = credential.response;
      await shared.postJson("/enroll/passkey/complete", {
        ...shared.publicKeyCredentialToJSON(credential),
        response: {
          ...shared.publicKeyCredentialToJSON(credential).response,
          authenticatorData: shared.encodeBase64Url(response.getAuthenticatorData()),
          publicKey: shared.encodeBase64Url(response.getPublicKey()),
          publicKeyAlgorithm: response.getPublicKeyAlgorithm(),
          transports: response.getTransports ? response.getTransports() : [],
        },
        flowToken: beginData.flowToken,
      });
      shared.setStatus("Enrollment complete. Redirecting...", "success");
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
