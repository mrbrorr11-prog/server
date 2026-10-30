using System;
using UnityEngine;

namespace RecFlare.ClientAuth
{
    /// <summary>
    /// Android Keystore-backed implementation. Requires the compiled Android Java plugin
    /// com.recflare.auth.SecureTokenStore to be packaged in the Unity APK.
    /// This class alone is not an IL2CPP APK patch.
    /// </summary>
    public sealed class AndroidKeystoreRefreshTokenStore : ISecureRefreshTokenStore
    {
        private static void EnsureAndroid()
        {
            if (Application.platform != RuntimePlatform.Android)
                throw new PlatformNotSupportedException("Android Keystore requires Android");
        }

        public string Read()
        {
            EnsureAndroid();
            using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
            using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
            using (var cls = new AndroidJavaClass("com.recflare.auth.SecureTokenStore"))
                return cls.CallStatic<string>("read", activity);
        }

        public void Write(string token)
        {
            EnsureAndroid();
            if (string.IsNullOrEmpty(token))
                throw new ArgumentException("Missing refresh token", nameof(token));
            using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
            using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
            using (var cls = new AndroidJavaClass("com.recflare.auth.SecureTokenStore"))
                cls.CallStatic("write", activity, token);
        }

        public void Delete()
        {
            EnsureAndroid();
            using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
            using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
            using (var cls = new AndroidJavaClass("com.recflare.auth.SecureTokenStore"))
                cls.CallStatic("delete", activity);
        }
    }
}
