package com.recflare.auth;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Per-app encrypted refresh-token storage for a Unity Android build.
 * Only ciphertext and IV are persisted; AES key never leaves AndroidKeyStore.
 * Compile this Java class into an Android library (.aar) in the Unity project.
 */
public final class SecureTokenStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "recflare.auth.refresh.v1";
    private static final String PREFS = "recflare_secure_session";
    private static final String SAVED = "encrypted_refresh_token";
    private static final String SAVED_IV = "refresh_token_iv";
    private static final String TRANSFORM = "AES/GCM/NoPadding";
    private SecureTokenStore() {}

    private static SharedPreferences prefs(Context context) {
        if (context == null) throw new IllegalArgumentException("Android context unavailable");
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey getKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        KeyStore.Entry stored = ks.getEntry(KEY_ALIAS, null);
        if (stored instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) stored).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    public static synchronized void write(Context context, String refreshToken) throws Exception {
        if (refreshToken == null || refreshToken.isEmpty())
            throw new IllegalArgumentException("Missing refresh token");
        Cipher cipher = Cipher.getInstance(TRANSFORM);
        cipher.init(Cipher.ENCRYPT_MODE, getKey());
        byte[] ciphertext = cipher.doFinal(refreshToken.getBytes(StandardCharsets.UTF_8));
        boolean saved = prefs(context).edit()
                .putString(SAVED, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(SAVED_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .commit();
        if (!saved) throw new IllegalStateException("Failed to save encrypted session");
    }

    public static synchronized String read(Context context) throws Exception {
        String encrypted = prefs(context).getString(SAVED, null);
        String encodedIv = prefs(context).getString(SAVED_IV, null);
        if (encrypted == null || encodedIv == null) return "";
        Cipher cipher = Cipher.getInstance(TRANSFORM);
        cipher.init(Cipher.DECRYPT_MODE, getKey(),
                new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)));
        byte[] plaintext = cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP));
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    public static synchronized void delete(Context context) {
        if (!prefs(context).edit().remove(SAVED).remove(SAVED_IV).commit())
            throw new IllegalStateException("Failed to clear saved session");
    }
}
