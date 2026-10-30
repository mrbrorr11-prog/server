# RecFlare saved-login client integration

Status: **source component added; not wired into the compiled Quest APK**.

The authentication Worker already exposes `POST /connect/token` and issues a rotating, 30-day refresh token. `SessionRestorer.cs` is a Unity-compatible coordinator for remembering a refresh token after a successful password login and redeeming it on the next launch.

## Integration into a Unity project you can rebuild

1. Add `SessionRestorer.cs` to the Unity client source.
2. Implement `ISecureRefreshTokenStore` with an Android Keystore-backed encrypted private store. Never use PlayerPrefs/plaintext or a shared Oculus placeholder ID as an authentication credential.
3. Instantiate `SessionRestorer` with the actual HTTPS auth service URL ending in `/connect/token`, and the secure store.
4. When password login succeeds, parse the *successful* token JSON into `OAuthTokenResponse` and call `RememberSuccessfulLogin`. Do not store the password.
5. During startup, before showing account selection, `StartCoroutine(restorer.Restore(...))`. On success, hand the returned access token to the game's existing authenticated-session initialization, fetch the player's actual profile, and render that player in the account selector. On `no_saved_session` / `session_expired`, offer normal password login; on `temporarily_unavailable`, allow retry rather than deleting the session.
6. On explicit account removal/logout, invoke `ForgetSavedSession`. If the game allows multiple saved profiles, create a distinct secure token entry per account and never select an account based only on an unverified platform ID.
7. Test launch → password login → full app termination → relaunch; Quest restart → relaunch; refresh rotation; internet offline; invalid/expired token; logout; two accounts on separate headsets.

## Constraints

This is **not an APK binary patch**. Your current build is IL2CPP, and committing this source does not change already-compiled native Unity code. It requires integration into an authorized Unity client project (or a carefully validated client patch and rebuild). We have not confirmed that the existing client exposes the integration points.

The shared sideload account entry (Coach) must not be linked to arbitrary real accounts. The server-side block against unverified Oculus placeholder platform identities must remain.

Never share actual refresh tokens, password values, auth headers, or unredacted live request bodies in logs.


## Android secure-storage plugin (new)

The folder `android/` contains a standalone Android library Gradle project. It uses
Android Keystore AES-GCM to encrypt a refresh token, stores only the ciphertext and IV
in app-private preferences, and exposes `SecureTokenStore.read/write/delete(Context)`.
`AndroidKeystoreRefreshTokenStore.cs` calls it from Unity and supplies the Unity activity.

With Android SDK 35, JDK 17, and Gradle 8.7 available, run:

```sh
cd tools/recflare-login-fix/android
gradle --no-daemon assembleRelease
```

That creates `android/build/outputs/aar/android-release.aar`, a plugin artifact
**not** a signed RecFlare APK. Add it to a buildable Unity project under
`Assets/Plugins/Android/`, along with the two C# source files, and wire up
`SessionRestorer` at login/startup. The existing IL2CPP APK won't execute either
component until a compatible client is compiled and installed.

**Security notes:** do not check keystore keys or real tokens into git; do not use
the unverified sideload placeholder identity for sign-in; don't log token responses.
A newly signed APK with a different Android signing key may require uninstalling
the existing app, which can clear its local data. Back up data first.
