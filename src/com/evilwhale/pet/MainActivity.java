package com.evilwhale.pet;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;

/**
 * Host for the 邪恶鲸鱼 / 初音未来 pet.
 *
 * The pet itself (animation, moods, dialogue, character switching) lives in
 * assets/pet.html + pet.css + pet.js + pet_config.js and is drawn in a
 * WebView.  This Activity supplies the window, haptics, the looping background
 * track and a small JS bridge.
 */
public class MainActivity extends Activity {

    private static final String TAG = "EvilWhale";
    private static final String BGM_ASSET = "bgm.m4a";

    private WebView web;
    private Vibrator vibrator;
    private MediaPlayer music;
    private TtsSpeaker speaker;
    private boolean musicPrepared = false;
    private boolean musicWanted = true;      // background music starts on entry
    private long lastBackPress = 0L;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setBackgroundColor(0xFF0A1330);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setWebViewClient(new WebViewClient());

        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        speaker = new TtsSpeaker(this);
        web.addJavascriptInterface(new Bridge(), "WhaleNative");

        setContentView(web);
        prepareMusic();
        web.loadUrl("file:///android_asset/pet.html");
        applyImmersiveMode();
    }

    /* ------------------------------------------------------------ window */

    private void applyImmersiveMode() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        decor.setOnSystemUiVisibilityChangeListener(new View.OnSystemUiVisibilityChangeListener() {
            @Override
            public void onSystemUiVisibilityChange(int visibility) {
                if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
                    applyImmersiveMode();
                }
            }
        });
    }

    /* ------------------------------------------------------------- music */

    /** Preloads the bundled track so the first tap starts it instantly. */
    private void prepareMusic() {
        if (music != null) {
            return;
        }
        final MediaPlayer mp = new MediaPlayer();
        try {
            AssetFileDescriptor afd = getAssets().openFd(BGM_ASSET);
            mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
        } catch (IOException e) {
            Log.w(TAG, "background music unavailable: " + e.getMessage());
            mp.release();
            return;
        }
        mp.setLooping(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
        }
        // Background music sits under the character voice, so keep it low.
        mp.setVolume(0.30f, 0.30f);
        mp.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
            @Override
            public void onPrepared(MediaPlayer player) {
                musicPrepared = true;
                if (musicWanted) {
                    player.start();
                }
            }
        });
        mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
            @Override
            public boolean onError(MediaPlayer player, int what, int extra) {
                Log.w(TAG, "music error what=" + what + " extra=" + extra);
                musicPrepared = false;
                return true;
            }
        });
        mp.prepareAsync();
        music = mp;
    }

    private boolean musicIsPlaying() {
        try {
            return music != null && musicPrepared && music.isPlaying();
        } catch (IllegalStateException e) {
            return false;
        }
    }

    private void musicPlay() {
        musicWanted = true;
        prepareMusic();
        if (music != null && musicPrepared && !musicIsPlaying()) {
            try {
                music.start();
            } catch (IllegalStateException e) {
                Log.w(TAG, "music start failed: " + e.getMessage());
            }
        }
    }

    private void musicPause() {
        musicWanted = false;
        if (music != null && musicPrepared && musicIsPlaying()) {
            try {
                music.pause();
            } catch (IllegalStateException e) {
                Log.w(TAG, "music pause failed: " + e.getMessage());
            }
        }
    }

    private void musicRelease() {
        if (music != null) {
            try {
                music.stop();
            } catch (IllegalStateException ignored) {
                // already stopped or never started
            }
            music.release();
            music = null;
        }
        musicPrepared = false;
        musicWanted = false;
    }

    /* -------------------------------------------------------------- bridge */

    /** Exposed to the WebView as window.WhaleNative. */
    private class Bridge {

        @JavascriptInterface
        public void buzz(int millis) {
            if (vibrator == null || !vibrator.hasVibrator()) {
                return;
            }
            int ms = Math.max(1, Math.min(millis, 400));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(ms);
            }
        }

        @JavascriptInterface
        public boolean musicAvailable() {
            return music != null;
        }

        @JavascriptInterface
        public void musicPlay() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.musicPlay();
                }
            });
        }

        @JavascriptInterface
        public void musicPause() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.musicPause();
                }
            });
        }

        @JavascriptInterface
        public boolean musicPlaying() {
            return musicIsPlaying();
        }

        /* ------------------------------------------------------------ voice */

        /**
         * Speaks a line in the active character's voice.
         *
         * @param text      the line to say
         * @param character "whale" or "miku"
         * @param mode      "say" or "sing"; accepted for the interface but the
         *                  treatment is currently identical, because singing
         *                  synthesis is not something a free offline engine
         *                  can do
         */
        @JavascriptInterface
        public void speak(final String text, final String character, final String mode) {
            if (speaker == null) { return; }
            speaker.speak(text, character, mode);
        }

        @JavascriptInterface
        public void setVoiceEnabled(final boolean on) {
            if (speaker != null) { speaker.setEnabled(on); }
        }

        @JavascriptInterface
        public boolean voiceEnabled() {
            return speaker != null && speaker.isEnabled();
        }

        @JavascriptInterface
        public void stopSpeaking() {
            if (speaker != null) { speaker.stop(); }
        }

        @JavascriptInterface
        public boolean voiceAvailable() {
            return speaker != null;
        }

        /** Favour hit rock bottom: the pet closes the whole app. */
        @JavascriptInterface
        public void quitApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    musicPause();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        finishAndRemoveTask();
                    } else {
                        finish();
                    }
                }
            });
        }

        /** Kept for compatibility with the first release of the pet. */
        @JavascriptInterface
        public void quit() {
            quitApp();
        }
    }

    /* ---------------------------------------------------------- lifecycle */

    @Override
    public void onBackPressed() {
        long now = System.currentTimeMillis();
        if (now - lastBackPress < 2200L) {
            musicPause();
            super.onBackPressed();
        } else {
            lastBackPress = now;
            web.evaluateJavascript("window.onAndroidBack && window.onAndroidBack();", null);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        musicPause();
        if (speaker != null) { speaker.stop(); }   // never talk in the background
        web.evaluateJavascript("window.onPetPause && window.onPetPause();", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        applyImmersiveMode();
        // music resumes automatically now that it starts on entry
        musicPlay();
        web.evaluateJavascript("window.onPetResume && window.onPetResume();", null);
    }

    @Override
    protected void onDestroy() {
        musicRelease();
        if (speaker != null) {
            speaker.release();
            speaker = null;
        }
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }
}
