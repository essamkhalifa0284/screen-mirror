package io.github.essamkhalifa0284.mirror;

import android.app.Activity;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web pages set this app's screen brightness (only while the app is open;
 * Android restores the normal brightness as soon as you leave the app).
 */
@CapacitorPlugin(name = "MirrorScreen")
public class MirrorScreenPlugin extends Plugin {

    /** value: 0.0 to 1.0, or -1 to go back to the phone's normal brightness. */
    @PluginMethod
    public void setBrightness(PluginCall call) {
        Double value = call.getDouble("value", -1.0);
        final float brightness = (value == null || value < 0)
                ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                : (float) Math.max(0.01, Math.min(1.0, value));

        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            WindowManager.LayoutParams lp = activity.getWindow().getAttributes();
            lp.screenBrightness = brightness;
            activity.getWindow().setAttributes(lp);
            call.resolve();
        });
    }
}
