package com.evilwhale.pet;

import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Free, offline character voice.
 *
 * There is no licensed 初音ミク voice bank that can legally ship inside this
 * app, so the approach is: let the device's own TextToSpeech engine synthesise
 * the line, then re-pitch and thicken it in software (see {@link VoiceFx})
 * towards the character's register.
 *
 *   whale : a little lower and slower
 *   miku  : pushed well up into her range, with a detuned double layer, which
 *           is what makes it read as synthetic rather than as a person
 *
 * Everything runs on-device.  Nothing is downloaded and no API key is needed.
 */
class TtsSpeaker implements TextToSpeech.OnInitListener {

    private static final String TAG = "EvilWhaleTts";

    private static final float WHALE_PITCH = 0.90f;
    private static final float MIKU_PITCH = 1.26f;
    private static final float SPEAK_RATE = 1.0f;
    private static final int MAX_QUEUE = 3;

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());

    private TextToSpeech tts;
    private boolean ready = false;
    private boolean released = false;
    private boolean enabled = true;
    private boolean busy = false;
    private String voiceName = "default";

    private final List<Utter> queue = new ArrayList<Utter>();
    private File currentFile;
    private String currentCharacter = "whale";

    private static class Utter {
        final String text;
        final String character;
        Utter(String text, String character) { this.text = text; this.character = character; }
    }

    TtsSpeaker(Context context) {
        this.context = context.getApplicationContext();
        tts = new TextToSpeech(this.context, this);
    }

    /* --------------------------------------------------------------- init */

    @Override
    public void onInit(int status) {
        if (released) { return; }
        if (status != TextToSpeech.SUCCESS) {
            Log.w(TAG, "no usable TTS engine on this device (status=" + status + ")");
            return;
        }
        ready = true;
        try {
            tts.setSpeechRate(SPEAK_RATE);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) { }

                @Override
                public void onDone(String id) {
                    // synthesis finished on a worker thread: process + play
                    Thread t = new Thread(new Runnable() {
                        @Override public void run() { finishCurrent(); }
                    }, "voice-fx");
                    t.start();
                }

                @Override
                public void onError(String id) {
                    Log.w(TAG, "synthesis error for " + id);
                    main.post(new Runnable() { @Override public void run() { advance(); } });
                }
            });
            pickVoice();
        } catch (Exception e) {
            Log.w(TAG, "voice setup failed: " + e.getMessage());
        }
        Log.i(TAG, "TTS ready, voice=" + voiceName);
    }

    /**
     * Picks the closest voice.  A Japanese voice would suit Miku's timbre, but
     * these lines are Chinese, so a Chinese voice that can actually pronounce
     * them wins; failing that the engine default is used and the pitch shift
     * carries the character on its own.
     */
    private void pickVoice() {
        int zh = tts.setLanguage(Locale.CHINA);
        if (zh == TextToSpeech.LANG_MISSING_DATA || zh == TextToSpeech.LANG_NOT_SUPPORTED) {
            tts.setLanguage(Locale.TAIWAN);
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) { return; }
        Voice best = chooseVoice();
        if (best != null) {
            try {
                tts.setVoice(best);
                voiceName = best.getName();
            } catch (Exception e) {
                Log.w(TAG, "setVoice failed: " + e.getMessage());
            }
        }
    }

    private Voice chooseVoice() {
        Set<Voice> voices;
        try {
            voices = tts.getVoices();
        } catch (Exception e) {
            return null;
        }
        if (voices == null || voices.isEmpty()) { return null; }
        Voice fallback = null;
        for (Voice v : voices) {
            if (v == null || v.isNetworkConnectionRequired()) { continue; }   // stay offline
            if (v.getLocale() == null || !"zh".equals(v.getLocale().getLanguage())) { continue; }
            if (fallback == null) { fallback = v; }
            String n = v.getName() == null ? "" : v.getName().toLowerCase(Locale.ROOT);
            if (n.contains("female") || n.contains("woman")
                    || n.contains("#f") || n.contains("_f")) {
                return v;
            }
        }
        return fallback;
    }

    /* ----------------------------------------------------------- public */

    void setEnabled(boolean on) {
        enabled = on;
        if (!on) { stop(); }
    }

    boolean isEnabled() { return enabled; }

    /** Queues a line; `character` selects the pitch treatment. */
    void speak(String text, String character, String mode) {
        // `mode` is part of the interface so a future engine could sing; the
        // current treatment is the same for speech and singing.
        speak(text, character);
    }

    /** Queues a line; `character` selects the pitch treatment. */
    void speak(final String text, final String character) {
        if (!enabled || text == null) { return; }
        final String trimmed = text.trim();
        if (trimmed.isEmpty()) { return; }
        main.post(new Runnable() {
            @Override
            public void run() {
                if (!ready || released) { return; }
                synchronized (queue) {
                    if (queue.size() >= MAX_QUEUE) { queue.remove(0); }
                    queue.add(new Utter(trimmed, character));
                }
                if (!busy) { advance(); }
            }
        });
    }

    void stop() {
        synchronized (queue) { queue.clear(); }
        busy = false;
        VoiceFx.stop();
        try { if (tts != null) { tts.stop(); } } catch (Exception ignored) { }
    }

    void release() {
        released = true;
        stop();
        if (tts != null) {
            try { tts.shutdown(); } catch (Exception ignored) { }
            tts = null;
        }
        ready = false;
        if (currentFile != null) {
            try { currentFile.delete(); } catch (Exception ignored) { }
            currentFile = null;
        }
    }

    /* ------------------------------------------------------------ chain */

    private void advance() {
        if (released) { busy = false; return; }
        Utter u;
        synchronized (queue) {
            if (queue.isEmpty()) { busy = false; return; }
            u = queue.remove(0);
        }
        busy = true;
        currentCharacter = u.character == null ? "whale" : u.character;
        try {
            File f = File.createTempFile("line", ".wav", context.getCacheDir());
            if (currentFile != null) { currentFile.delete(); }
            currentFile = f;
            tts.synthesizeToFile(u.text, new Bundle(), f, u.character);
        } catch (Exception e) {
            Log.w(TAG, "synthesizeToFile failed: " + e.getMessage());
            busy = false;
        }
    }

    /** Reads the synthesised WAV, applies the treatment and plays it. */
    private void finishCurrent() {
        File f = currentFile;
        if (f == null || !f.exists()) {
            main.post(new Runnable() { @Override public void run() { advance(); } });
            return;
        }
        try {
            Wav w = readWav(f);
            if (w == null || w.samples.length == 0) {
                Log.w(TAG, "empty synthesis output");
            } else {
                short[] out = VoiceFx.process(w.samples, pitchFor(currentCharacter), true, w.sampleRate);
                VoiceFx.play(out, w.sampleRate);
            }
        } catch (Exception e) {
            Log.w(TAG, "voice processing failed: " + e.getMessage());
        } finally {
            try { f.delete(); } catch (Exception ignored) { }
            main.post(new Runnable() { @Override public void run() { advance(); } });
        }
    }

    private float pitchFor(String character) {
        return "miku".equals(character) ? MIKU_PITCH : WHALE_PITCH;
    }

    /* -------------------------------------------------------------- wav */

    private static class Wav {
        short[] samples;
        int sampleRate;
    }

    /** Minimal RIFF reader: 16-bit PCM, mono or stereo (downmixed). */
    private static Wav readWav(File f) {
        FileInputStream in = null;
        try {
            byte[] all = new byte[(int) f.length()];
            in = new FileInputStream(f);
            int read = 0;
            while (read < all.length) {
                int n = in.read(all, read, all.length - read);
                if (n <= 0) { break; }
                read += n;
            }
            if (read < 44) { return null; }
            int pos = 12;
            int sampleRate = 16000;
            int channels = 1;
            int bits = 16;
            int dataStart = -1;
            int dataLen = 0;
            while (pos + 8 <= read) {
                String id = new String(all, pos, 4, "US-ASCII");
                int size = le32(all, pos + 4);
                int body = pos + 8;
                if ("fmt ".equals(id)) {
                    if (body + 16 <= read) {
                        channels = le16(all, body + 2);
                        sampleRate = le32(all, body + 4);
                        bits = le16(all, body + 14);
                    }
                } else if ("data".equals(id)) {
                    dataStart = body;
                    dataLen = Math.min(size, read - body);
                    break;
                }
                pos = body + size + (size & 1);
            }
            if (dataStart < 0 || dataLen <= 0) { return null; }
            if (channels < 1) { channels = 1; }
            if (bits != 16) {
                Log.w(TAG, "unsupported PCM depth: " + bits);
                return null;
            }
            int frames = dataLen / (2 * channels);
            short[] out = new short[frames];
            for (int i = 0; i < frames; i++) {
                int base = dataStart + i * 2 * channels;
                if (channels == 1) {
                    out[i] = (short) ((all[base] & 0xFF) | (all[base + 1] << 8));
                } else {
                    int sum = 0;
                    for (int c = 0; c < channels; c++) {
                        int b = base + c * 2;
                        sum += (short) ((all[b] & 0xFF) | (all[b + 1] << 8));
                    }
                    out[i] = (short) (sum / channels);
                }
            }
            Wav w = new Wav();
            w.samples = out;
            w.sampleRate = sampleRate > 0 ? sampleRate : 16000;
            return w;
        } catch (Exception e) {
            Log.w(TAG, "wav read failed: " + e.getMessage());
            return null;
        } finally {
            try { if (in != null) { in.close(); } } catch (Exception ignored) { }
        }
    }

    private static int le16(byte[] b, int i) {
        return (b[i] & 0xFF) | ((b[i + 1] & 0xFF) << 8);
    }

    private static int le32(byte[] b, int i) {
        return (b[i] & 0xFF) | ((b[i + 1] & 0xFF) << 8)
                | ((b[i + 2] & 0xFF) << 16) | ((b[i + 3] & 0xFF) << 24);
    }
}
