// RecFlare session restoration component for an authorized Unity client project.
// This source is not injected into an existing IL2CPP APK automatically.
// IMPORTANT: Implement ISecureRefreshTokenStore using Android Keystore-backed storage.
// Do not use PlayerPrefs, plaintext files, a shared headset identity, or hardcoded tokens.
using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

namespace RecFlare.ClientAuth
{
    public interface ISecureRefreshTokenStore
    {
        string Read();
        void Write(string token);
        void Delete();
    }

    [Serializable]
    public sealed class OAuthTokenResponse
    {
        public string access_token;
        public string refresh_token;
        public string token_type;
        public int expires_in;
    }

    public sealed class SessionRestorer
    {
        private readonly ISecureRefreshTokenStore store;
        private readonly string tokenUrl;

        public SessionRestorer(string tokenUrl, ISecureRefreshTokenStore store)
        {
            if (!Uri.TryCreate(tokenUrl, UriKind.Absolute, out var uri) ||
                uri.Scheme != Uri.UriSchemeHttps)
                throw new ArgumentException("HTTPS token endpoint required", nameof(tokenUrl));
            this.tokenUrl = tokenUrl;
            this.store = store ?? throw new ArgumentNullException(nameof(store));
        }

        // Call after a successful password login; do not persist the password.
        public bool RememberSuccessfulLogin(OAuthTokenResponse response)
        {
            if (response == null || string.IsNullOrEmpty(response.refresh_token))
                return false;
            store.Write(response.refresh_token);
            return true;
        }

        // Run as a Unity coroutine on startup. Successful callback receives access-token data.
        // A temporary network failure leaves the saved refresh token alone.
        public IEnumerator Restore(Action<OAuthTokenResponse> onSuccess,
                                   Action<string> onFailure)
        {
            string saved;
            try { saved = store.Read(); }
            catch { onFailure?.Invoke("secure_store_unavailable"); yield break; }
            if (string.IsNullOrEmpty(saved))
            {
                onFailure?.Invoke("no_saved_session");
                yield break;
            }

            var form = new WWWForm();
            form.AddField("grant_type", "refresh_token");
            form.AddField("refresh_token", saved);
            using (var request = UnityWebRequest.Post(tokenUrl, form))
            {
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success)
                {
                    // 400 invalid_grant indicates the saved token cannot be redeemed.
                    // A timeout/5xx must not erase an otherwise valid session.
                    if (request.responseCode == 400 || request.responseCode == 401)
                    {
                        store.Delete();
                        onFailure?.Invoke("session_expired");
                    }
                    else onFailure?.Invoke("temporarily_unavailable");
                    yield break;
                }

                OAuthTokenResponse response;
                try { response = JsonUtility.FromJson<OAuthTokenResponse>(request.downloadHandler.text); }
                catch { onFailure?.Invoke("invalid_server_response"); yield break; }
                if (response == null || string.IsNullOrEmpty(response.access_token) ||
                    string.IsNullOrEmpty(response.refresh_token))
                {
                    onFailure?.Invoke("invalid_server_response");
                    yield break;
                }

                // The server rotates tokens on every refresh. Save the new token BEFORE
                // continuing login; otherwise the next launch reuses an invalid old token.
                try { store.Write(response.refresh_token); }
                catch
                {
                    onFailure?.Invoke("secure_store_write_failed");
                    yield break;
                }
                onSuccess?.Invoke(response);
            }
        }

        public void ForgetSavedSession() => store.Delete();
    }
}
