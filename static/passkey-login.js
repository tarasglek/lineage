(function () {
  const shared = window.LineagePasskey;
  const root = shared?.passkeyRoot();

  function normalizeRequestOptions(options) {
    return {
      publicKey: {
        ...options,
        challenge: shared.decodeBase64Url(options.challenge),
        allowCredentials: (options.allowCredentials || []).map((credential) => ({
          ...credential,
          id: shared.decodeBase64Url(credential.id),
        })),
      },
    };
  }

  async function start(button) {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      shared.setStatus('This browser does not support passkeys.', 'error');
      return;
    }

    const username = root?.dataset.username || '';
    button.disabled = true;
    shared.setStatus('Preparing passkey sign-in...');

    try {
      const beginData = await shared.postJson('/login/begin', { username });
      shared.setStatus('Use your passkey to sign in...');
      const credential = await navigator.credentials.get(normalizeRequestOptions(beginData));
      if (!credential) throw new Error('credential_request_cancelled');
      await shared.postJson('/login/complete', {
        ...shared.publicKeyCredentialToJSON(credential),
        flowToken: beginData.flowToken,
      });
      shared.setStatus('Login complete. Redirecting...', 'success');
      window.location.assign('/account');
    } catch (error) {
      const message = error && error.name === 'NotAllowedError'
        ? 'Passkey prompt was cancelled or timed out.'
        : String(error?.message || error);
      shared.setStatus(message, 'error');
      button.disabled = false;
    }
  }

  shared?.bindPasskeyAction(start);
})();
