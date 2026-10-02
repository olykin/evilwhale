package com.evilwhale.pet;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.util.Log;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The voice treatment: takes mono 16-bit PCM and turns it into the character's
 * register.
 *
 *  - pitch shift via overlap-add: each grain is resampled by 1/ratio, which
 *    raises the pitch by `ratio` while the grain hop keeps the overall
 *    duration roughly intact.
 *  - optional chorus: a short, slowly-swinging, detuned copy mixed back in.
 *    That doubling is what makes it read as a synthesised vocal rather than a
 *    person, which is the whole point for a vocaloid character.
 *
 * Pure arithmetic on short buffers, so it stays free and fully offline.
 */
final class VoiceFx {

    private static final String TAG = "EvilWhaleVoice";

    /** Grain size in samples. ~40ms at 16 kHz; short enough to track speech. */
    private static final int GRAIN = 640;
    private static final int OVERLAP = 4;              // 75% overlap

    private static final AtomicBoolean PLAYING = new AtomicBoolean(false);
    private static AudioTrack track;

    private VoiceFx() { }

    static boolean isPlaying() { return PLAYING.get(); }

    /** Stops whatever is currently being played and frees the track. */
    static void stop() {
        AudioTrack t = track;
        track = null;
        if (t != null) {
            try { t.pause(); } catch (Exception ignored) { }
            try { t.flush(); } catch (Exception ignored) { }
            try { t.release(); } catch (Exception ignored) { }
        }
        PLAYING.set(false);
    }

    /**
     * Applies the character treatment to a mono 16-bit buffer.
     *
     * @param in         raw samples
     * @param ratio      >1 raises the pitch, <1 lowers it
     * @param chorus     add the detuned double layer
     * @param sampleRate the buffer's rate, for the chorus delay line
     * @return the processed buffer
     */
    static short[] process(short[] in, float ratio, boolean chorus, int sampleRate) {
        if (in == null || in.length == 0) { return in; }
        int sr = sampleRate > 0 ? sampleRate : 16000;
        float[] x = new float[in.length];
        for (int i = 0; i < in.length; i++) { x[i] = in[i] / 32768f; }

        if (Math.abs(ratio - 1f) > 0.01f) {
            x = pitchShift(x, ratio);
        }
        if (chorus) {
            x = chorus(x, sr);
        }
        return normalise(x);
    }

    /**
     * Overlap-add pitch shift.  Grains are read `ratio` times faster than they
     * are laid down, so the pitch moves by `ratio`; the synthesis hop is what
     * preserves the length.
     */
    private static float[] pitchShift(float[] x, float ratio) {
        int hop = GRAIN / OVERLAP;                 // synthesis hop
        int readHop = Math.max(1, Math.round(hop * ratio));
        int pad = GRAIN + (int) (GRAIN * ratio) + 8;
        float[] padded = new float[x.length + pad];
        System.arraycopy(x, 0, padded, 0, x.length);

        int frames = Math.max(1, (x.length + pad - GRAIN) / hop);
        float[] out = new float[frames * hop + GRAIN];
        float[] win = hann(GRAIN);

        for (int f = 0; f < frames; f++) {
            int src = f * readHop;
            int dst = f * hop;
            if (src + GRAIN >= padded.length || dst + GRAIN > out.length) { break; }
            for (int i = 0; i < GRAIN; i++) {
                out[dst + i] += padded[src + i] * win[i];
            }
        }
        return out;
    }

    /** Mixes in a delayed, pitch-modulated copy to thicken the voice. */
    private static float[] chorus(float[] x, int sr) {
        final float delayMs = 14f;
        final float swingMs = 5f;
        final float depth = 0.40f;
        final float rateHz = 0.9f;

        int maxDelay = (int) ((delayMs + swingMs) * sr / 1000f) + 2;
        float[] out = new float[x.length];
        float phase = 0f;
        float step = (float) (2 * Math.PI * rateHz / sr);
        for (int i = 0; i < x.length; i++) {
            float mod = (float) Math.sin(phase);
            phase += step;
            if (phase > 2 * Math.PI) { phase -= (float) (2 * Math.PI); }
            int d = (int) ((delayMs + swingMs * mod) * sr / 1000f);
            if (d > maxDelay) { d = maxDelay; }
            float wet = (i - d >= 0) ? x[i - d] : 0f;
            out[i] = x[i] + depth * wet;
        }
        return out;
    }

    private static float[] hann(int n) {
        float[] w = new float[n];
        for (int i = 0; i < n; i++) {
            w[i] = (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
        }
        return w;
    }

    /** Scales to a comfortable peak so the character voices are not clipping. */
    private static short[] normalise(float[] x) {
        float peak = 0f;
        for (float v : x) {
            float a = v < 0 ? -v : v;
            if (a > peak) { peak = a; }
        }
        float gain = 1f;
        if (peak > 0.98f) { gain = 0.98f / peak; }
        else if (peak > 0f && peak < 0.35f) { gain = 0.85f / peak; }   // lift quiet output
        short[] out = new short[x.length];
        for (int i = 0; i < x.length; i++) {
            int v = Math.round(x[i] * gain * 32767f);
            if (v > 32767) { v = 32767; }
            if (v < -32768) { v = -32768; }
            out[i] = (short) v;
        }
        return out;
    }

    /* --------------------------------------------------------- playback */

    /** Plays a mono 16-bit buffer, replacing anything already playing. */
    static void play(short[] pcm, int sampleRate) {
        stop();
        if (pcm == null || pcm.length == 0) { return; }
        int minBytes = AudioTrack.getMinBufferSize(sampleRate,
                AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int bytes = pcm.length * 2;
        if (minBytes <= 0) { minBytes = bytes; }
        int bufSize = Math.max(minBytes, Math.min(bytes, minBytes * 4));

        AudioTrack t;
        try {
            t = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setBufferSizeInBytes(bufSize)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();
        } catch (Exception e) {
            Log.w(TAG, "AudioTrack build failed: " + e.getMessage());
            return;
        }
        track = t;
        PLAYING.set(true);
        try {
            t.play();
            int offset = 0;
            while (offset < pcm.length && t == track) {
                int chunk = Math.min(1024, pcm.length - offset);
                int written = t.write(pcm, offset, chunk);
                if (written <= 0) { break; }
                offset += written;
            }
            // let the buffer drain before releasing
            if (t == track) { Thread.sleep(Math.max(0, pcm.length * 1000L / sampleRate + 120)); }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            Log.w(TAG, "playback failed: " + e.getMessage());
        } finally {
            if (t == track) {
                track = null;
                try { t.stop(); } catch (Exception ignored) { }
            }
            try { t.release(); } catch (Exception ignored) { }
            PLAYING.set(false);
        }
    }

    static int sampleRateFor(int declared) {
        return declared > 0 ? declared : 16000;
    }
}
